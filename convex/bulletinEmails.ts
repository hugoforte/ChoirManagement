// The email a Bulletin sends when it is published (#52), and the only place
// in this app that talks to a mail provider.
//
// Shape of the flow, and why it is split this way:
//
//   bulletins.publish (mutation)  → queueBulletinEmails writes one `queued`
//                                   bulletinEmailSends row per opted-in
//                                   Member and schedules the action. No
//                                   network I/O, and no roster-sized failure
//                                   can roll back the publish itself.
//   sendQueued (internalAction)   → hands each row to the Resend component
//                                   one at a time, so one bad address marks
//                                   one row `failed` instead of losing the
//                                   whole send.
//   handleEmailEvent (internalMutation) → Resend's webhook, routed through
//                                   the component from convex/http.ts,
//                                   advances a row to delivered/bounced.
//
// A deployment with no mail provider configured is a supported state, not an
// error: publish still succeeds, nothing is queued, and the UI says so.
import { v } from "convex/values";
import { Resend, vOnEmailEventArgs, type EmailEvent, type EmailId } from "@convex-dev/resend";

import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { requireCan, requireMember } from "./lib/auth";
import {
  bulletinEmailUrl,
  readEmailConfig,
  renderBulletinEmail,
  type BulletinEmailConfig,
  RESEND_WEBHOOK_PATH,
} from "./lib/bulletinEmail";
import schema from "./schema";

const sendStatus = schema.tables.bulletinEmailSends.validator.fields.status;

// Roster-sized reads. A choir is not an unbounded user base, but `.collect()`
// on a table nobody bounds is how a query stops scaling quietly, so every
// read here takes a ceiling.
//
// Hitting it would silently email only the first 500 Members, so it never
// passes unremarked: the queue logs it, and the Director's delivery summary
// carries a `truncated` flag that the panel turns into a warning. A choir
// that large needs batching this slice does not have.
const ROSTER_LIMIT = 500;

const NOT_CONFIGURED = "Email is not configured for this deployment";
const NO_ADDRESS = "No email address on file for this Member";

// A note on configuration, since `convex/_generated/ai/guidelines.md` prefers
// typed app env vars declared in `convex.config.ts` over `process.env`: two of
// this feature's four variables are not ours to move. The Resend component's
// own constructor reads `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` from
// `process.env` itself. Declaring only the other two on `defineApp({ env })`
// would split one feature's configuration across two mechanisms and leave
// `readEmailConfig` unable to validate the set as a unit, which is the whole
// point of it returning null-or-complete. One idiom for all four wins.
//
// Built per call rather than once at module scope. The constructor snapshots
// `process.env.RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` at the moment it
// runs, so a module-level instance would bake in whatever the environment
// looked like when the module was first loaded — including during a deploy
// that has no keys set yet. Constructing one is cheap; it holds config and a
// component reference, nothing more.
function resendClient(apiKey?: string): Resend {
  return new Resend(components.resend, {
    ...(apiKey !== undefined && { apiKey }),
    // The whole point is emailing the real roster. Resend's default refuses
    // every address outside its own test domain, which would silently make
    // the feature do nothing on a correctly configured deployment.
    testMode: false,
    onEmailEvent: internal.bulletinEmails.handleEmailEvent,
  });
}

// The component reads this from the environment itself; convex/http.ts reads
// it too, to answer 503 rather than throw when a deployment has no webhook
// registered. One place naming the variable.
export function resendWebhookSecret(): string {
  return (process.env.RESEND_WEBHOOK_SECRET ?? "").trim();
}

// Wrapped rather than exposing the client, so convex/http.ts doesn't have to
// know how the component is constructed.
//
// The component verifies the Svix signature and *throws* when it fails, which
// would surface as a 500 — telling every scanner that pokes this public URL
// that it broke something, and telling Resend to retry a request that can
// never succeed. A failed signature is a refusal, so it answers 401.
//
// Only that one error is translated. Anything else — the component's own
// mutation failing, say — is a genuine server fault and must stay a 5xx, so
// that Resend retries it and it shows up in the deployment's logs.
export async function handleResendWebhook(ctx: ActionCtx, request: Request): Promise<Response> {
  try {
    return await resendClient().handleResendEventWebhook(ctx, request);
  } catch (error) {
    if (isSignatureFailure(error)) {
      return new Response("Invalid signature", { status: 401 });
    }
    throw error;
  }
}

// Matched by name rather than `instanceof`: the class is svix's
// `WebhookVerificationError`, reached only as a transitive dependency of the
// component, and importing it here would tie this app to a package the
// component is free to swap.
function isSignatureFailure(error: unknown): boolean {
  return error instanceof Error && error.name === "WebhookVerificationError";
}

// ---------------------------------------------------------------------------
// Publish-time queueing

// Called from `bulletins.publish` inside its transaction, so the queued rows
// and the published Bulletin commit together or not at all. Returns how many
// Members are being emailed, which is what the caller's `returns` validator
// reports back to the UI.
export async function queueBulletinEmails(
  ctx: MutationCtx,
  bulletinId: Id<"bulletins">,
): Promise<number> {
  if (readEmailConfig(process.env) === null) return 0;

  const roster = await ctx.db.query("members").take(ROSTER_LIMIT);
  if (roster.length === ROSTER_LIMIT) {
    console.warn(
      `Bulletin email: roster read hit the ${ROSTER_LIMIT}-Member ceiling, so some Members may not have been queued.`,
    );
  }
  // Absent means opted in — see the schema comment. Only an explicit false
  // is an opt-out, so Members who predate the toggle still get the email.
  const recipients = roster.filter((member) => member.emailBulletins !== false);
  if (recipients.length === 0) return 0;

  const now = Date.now();
  let queued = 0;
  for (const member of recipients) {
    // A Member whose Clerk identity carried no email address gets a `failed`
    // row rather than being skipped. There is nothing to send to, but the
    // Director should see that in the delivery summary instead of wondering
    // why the roster count and the email count disagree.
    const address = member.email.trim();
    await ctx.db.insert("bulletinEmailSends", {
      bulletinId,
      memberId: member._id,
      status: address ? "queued" : "failed",
      error: address ? undefined : NO_ADDRESS,
      updatedAt: now,
    });
    if (address) queued += 1;
  }

  if (queued > 0) {
    await ctx.scheduler.runAfter(0, internal.bulletinEmails.sendQueued, { bulletinId });
  }
  return queued;
}

// ---------------------------------------------------------------------------
// Sending

// The one function in this module that reaches a mail provider, named as a
// type so a test can substitute its own. Everything around it — which rows
// to send, what happens to a row that throws — is then testable without the
// component being reachable at all.
export type BulletinEmailSender = (
  ctx: ActionCtx,
  email: {
    config: BulletinEmailConfig;
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  },
) => Promise<string>;

const sendThroughResend: BulletinEmailSender = async (ctx, email) =>
  await resendClient(email.config.apiKey).sendEmail(ctx, {
    from: email.config.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: email.idempotencyKey,
  });

// What the send action needs, read in one transaction so it can't see a
// half-published Bulletin.
const queuedBatch = v.union(
  v.null(),
  v.object({
    title: v.string(),
    body: v.string(),
    shareToken: v.union(v.string(), v.null()),
    recipients: v.array(
      v.object({ sendId: v.id("bulletinEmailSends"), to: v.string() }),
    ),
  }),
);

export const pendingForBulletin = internalQuery({
  args: { bulletinId: v.id("bulletins") },
  returns: queuedBatch,
  handler: async (ctx, { bulletinId }) => {
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    if (!bulletin) return null;

    const rows = await ctx.db
      .query("bulletinEmailSends")
      .withIndex("by_bulletin_id", (q) => q.eq("bulletinId", bulletinId))
      .take(ROSTER_LIMIT);

    const recipients = [];
    for (const row of rows.filter((r) => r.status === "queued")) {
      const member = await ctx.db.get("members", row.memberId);
      const to = member?.email.trim();
      if (to) recipients.push({ sendId: row._id, to });
    }

    return {
      title: bulletin.title,
      body: bulletin.body,
      shareToken: bulletin.shareLink?.token ?? null,
      recipients,
    };
  },
});

export const markSent = internalMutation({
  args: { sendId: v.id("bulletinEmailSends"), providerMessageId: v.string() },
  returns: v.null(),
  handler: async (ctx, { sendId, providerMessageId }) => {
    await ctx.db.patch("bulletinEmailSends", sendId, {
      status: "sent",
      providerMessageId,
      error: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: { sendId: v.id("bulletinEmailSends"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { sendId, error }) => {
    await ctx.db.patch("bulletinEmailSends", sendId, {
      status: "failed",
      error,
      updatedAt: Date.now(),
    });
    return null;
  },
});

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

// Exported and taking its sender as an argument so the failure path can be
// driven directly in a test: `sendQueued` below is the thin wrapper that
// binds the real provider.
//
// One recipient at a time, each with its own mutation, because the point of
// a row per Member is that one bad address is one visible failure. A single
// batching mutation would roll every row back together and the Director
// would see nothing.
export async function sendQueuedBulletinEmails(
  ctx: ActionCtx,
  bulletinId: Id<"bulletins">,
  send: BulletinEmailSender,
): Promise<null> {
  const batch = await ctx.runQuery(internal.bulletinEmails.pendingForBulletin, { bulletinId });
  if (!batch) return null;

  const config = readEmailConfig(process.env);
  const email =
    config &&
    renderBulletinEmail({
      title: batch.title,
      body: batch.body,
      url: bulletinEmailUrl(config.appBaseUrl, {
        bulletinId,
        shareToken: batch.shareToken ?? undefined,
      }),
    });

  for (const recipient of batch.recipients) {
    if (!config || !email) {
      await ctx.runMutation(internal.bulletinEmails.markFailed, {
        sendId: recipient.sendId,
        error: NOT_CONFIGURED,
      });
      continue;
    }
    try {
      const providerMessageId = await send(ctx, {
        config,
        to: recipient.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        // The row id is unique per Bulletin per Member, so a retried or
        // re-scheduled action collapses onto the same email instead of
        // sending a second copy.
        idempotencyKey: `bulletinEmailSend:${recipient.sendId}`,
      });
      await ctx.runMutation(internal.bulletinEmails.markSent, {
        sendId: recipient.sendId,
        providerMessageId,
      });
    } catch (error) {
      // Swallowed here on purpose, and only here: the throw is recorded on
      // the row so the Director sees it, and the loop continues so one bad
      // address doesn't cost everyone else their email.
      await ctx.runMutation(internal.bulletinEmails.markFailed, {
        sendId: recipient.sendId,
        error: errorText(error),
      });
    }
  }

  // `sendEmail` only enqueued these; the actual POST to Resend happens later
  // inside the component's workpool, and a permanent rejection there (a bad
  // key, an unverified sender domain) never reaches `handleEmailEvent` —
  // that callback fires for *webhook* events only. Without this pass a row
  // would sit at "handed to the provider" forever while Resend had refused
  // it, which is precisely the first failure a new deployment hits.
  if (batch.recipients.length > 0) {
    await ctx.scheduler.runAfter(RECONCILE_DELAYS_MS[0], internal.bulletinEmails.reconcile, {
      bulletinId,
      attempt: 0,
    });
  }
  return null;
}

export const sendQueued = internalAction({
  args: { bulletinId: v.id("bulletins") },
  returns: v.null(),
  handler: async (ctx, { bulletinId }) =>
    await sendQueuedBulletinEmails(ctx, bulletinId, sendThroughResend),
});

// ---------------------------------------------------------------------------
// Reconciliation: what the provider itself says became of each email
//
// The webhook (below) is the fast path and carries the richer information,
// but it only exists once the owner has registered it, and it never fires for
// an email Resend refused outright. This pass asks the component directly.
//
// Twice, then stop: once a minute after sending, to catch an outright
// rejection while the Director is still looking at the page, and once a
// quarter-hour later for a batch that was merely slow. Anything still
// unsettled after that is a delivery nobody has heard about either way, and
// the webhook remains free to settle it whenever it arrives.
const RECONCILE_DELAYS_MS = [60_000, 15 * 60_000];

// The second seam, alongside the sender: reading a provider's verdict is the
// other thing a test cannot do for real.
export type BulletinEmailStatusReader = (
  ctx: ActionCtx,
  providerMessageId: string,
) => Promise<{ status: string; errorMessage: string | null } | null>;

const readStatusFromResend: BulletinEmailStatusReader = async (ctx, providerMessageId) => {
  const status = await resendClient().status(ctx, providerMessageId as EmailId);
  return status ? { status: status.status, errorMessage: status.errorMessage } : null;
};

const unsettledRow = v.object({
  sendId: v.id("bulletinEmailSends"),
  providerMessageId: v.string(),
  status: sendStatus,
});

export const unsettledForBulletin = internalQuery({
  args: { bulletinId: v.id("bulletins") },
  returns: v.array(unsettledRow),
  handler: async (ctx, { bulletinId }) => {
    const rows = await ctx.db
      .query("bulletinEmailSends")
      .withIndex("by_bulletin_id", (q) => q.eq("bulletinId", bulletinId))
      .take(ROSTER_LIMIT);

    // A row with no provider id never reached Resend, so Resend has nothing
    // to say about it — it is already `failed` for a reason of our own.
    return rows.flatMap((row) =>
      (row.status === "queued" || row.status === "sent") && row.providerMessageId
        ? [{ sendId: row._id, providerMessageId: row.providerMessageId, status: row.status }]
        : [],
    );
  },
});

export const applyProviderStatus = internalMutation({
  args: { sendId: v.id("bulletinEmailSends"), status: sendStatus, error: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { sendId, status, error }) => {
    const row = await ctx.db.get("bulletinEmailSends", sendId);
    if (!row || !advances(row.status, status)) return null;
    await ctx.db.patch("bulletinEmailSends", sendId, {
      status,
      ...(error !== null && { error }),
      updatedAt: Date.now(),
    });
    return null;
  },
});

// The component's vocabulary is wider than this table's. `waiting`/`queued`
// mean it has not been handed over yet and `delivery_delayed` means it is
// still trying — all three are "ask again later", not an outcome.
function statusFromProvider(
  providerStatus: string,
  errorMessage: string | null,
): { status: SendStatus; error: string | null } | null {
  switch (providerStatus) {
    case "sent":
      return { status: "sent", error: null };
    case "delivered":
      return { status: "delivered", error: null };
    case "bounced":
      return { status: "bounced", error: errorMessage ?? "Bounced" };
    case "failed":
      return { status: "failed", error: errorMessage ?? "The mail provider rejected this email" };
    case "cancelled":
      return { status: "failed", error: errorMessage ?? "Cancelled before it was sent" };
    default:
      return null;
  }
}

export async function reconcileBulletinEmails(
  ctx: ActionCtx,
  bulletinId: Id<"bulletins">,
  attempt: number,
  readStatus: BulletinEmailStatusReader,
): Promise<null> {
  const rows = await ctx.runQuery(internal.bulletinEmails.unsettledForBulletin, { bulletinId });
  if (rows.length === 0) return null;

  let stillUnsettled = 0;
  for (const row of rows) {
    // A null reading means the component no longer holds that email — it
    // prunes finalized rows on a schedule. Leaving ours as it stands beats
    // inventing an outcome.
    const reading = await readStatus(ctx, row.providerMessageId).catch(() => null);
    const update = reading && statusFromProvider(reading.status, reading.errorMessage);
    if (!update || update.status === "sent") {
      stillUnsettled += 1;
      continue;
    }
    await ctx.runMutation(internal.bulletinEmails.applyProviderStatus, {
      sendId: row.sendId,
      status: update.status,
      error: update.error,
    });
  }

  const next = attempt + 1;
  if (stillUnsettled > 0 && next < RECONCILE_DELAYS_MS.length) {
    await ctx.scheduler.runAfter(RECONCILE_DELAYS_MS[next], internal.bulletinEmails.reconcile, {
      bulletinId,
      attempt: next,
    });
  }
  return null;
}

export const reconcile = internalAction({
  args: { bulletinId: v.id("bulletins"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { bulletinId, attempt }) =>
    await reconcileBulletinEmails(ctx, bulletinId, attempt, readStatusFromResend),
});

// ---------------------------------------------------------------------------
// Delivery feedback

// Registered as the component's `onEmailEvent` callback, so it runs for
// every Resend webhook the component accepts (see convex/http.ts). Internal:
// the component calls it through a function handle, never a client.
export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs.fields,
  returns: v.null(),
  handler: async (ctx, { id, event }) => {
    const row = await ctx.db
      .query("bulletinEmailSends")
      .withIndex("by_provider_message_id", (q) => q.eq("providerMessageId", id))
      .unique();
    // Not ours, or the Bulletin was deleted between send and webhook.
    if (!row) return null;

    const update = statusFromEvent(event);
    if (!update) return null;
    if (!advances(row.status, update.status)) return null;

    await ctx.db.patch("bulletinEmailSends", row._id, { ...update, updatedAt: Date.now() });
    return null;
  },
});

type SendStatus = Doc<"bulletinEmailSends">["status"];

// Webhook events are not ordered: `email.sent` can land after
// `email.delivered`, and re-stamping a delivered row as merely sent would
// lose the outcome. Rank them and only ever move forward.
//
// The three settled states share a rank on purpose — a delivered address can
// still bounce afterwards, and a reconciliation pass may learn that mail the
// provider accepted was later rejected. Those are real transitions and are
// allowed; only going *back* toward queued is not.
const STATUS_RANK: Record<SendStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  bounced: 2,
  failed: 2,
};

function advances(from: SendStatus, to: SendStatus): boolean {
  return STATUS_RANK[to] >= STATUS_RANK[from] && to !== from;
}

// Only the four outcomes this table models. Opens, clicks, spam complaints
// and delivery delays are real Resend events and are deliberately ignored:
// #52 asks for failures to be visible, not for an engagement dashboard, and
// a delayed email is still on its way.
function statusFromEvent(event: EmailEvent): { status: SendStatus; error?: string } | null {
  switch (event.type) {
    case "email.sent":
      return { status: "sent" };
    case "email.delivered":
      return { status: "delivered" };
    case "email.bounced":
      return { status: "bounced", error: event.data.bounce.message };
    case "email.failed":
      return { status: "failed", error: event.data.failed.reason };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// The Director-facing read

// Whether this deployment can send at all. The manage page swaps the
// "Email this Bulletin to the roster" checkbox for an explanation when it
// can't, and every Member's opt-out toggle hides itself — so a self-hoster
// isn't offered controls that do nothing.
//
// requireMember, not manageBulletins: the Chorister who decides whether to
// receive Bulletin email needs this answer too. All it discloses to a signed-
// in Member is whether this deployment sends email at all.
export const isConfigured = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    await requireMember(ctx);
    return readEmailConfig(process.env) !== null;
  },
});

const deliverySummary = v.object({
  queued: v.number(),
  sent: v.number(),
  delivered: v.number(),
  bounced: v.number(),
  failed: v.number(),
  // True when this Bulletin has at least ROSTER_LIMIT delivery rows, so the
  // counts below may be a partial view rather than the whole send.
  truncated: v.boolean(),
  // Named, because "3 failed" without the names is not something a Director
  // can act on. Bounces and failures only — a queued row isn't a problem yet.
  problems: v.array(
    v.object({
      memberName: v.string(),
      status: sendStatus,
      error: v.union(v.string(), v.null()),
    }),
  ),
});

const UNKNOWN_MEMBER = "Removed Member";

export const summaryForBulletin = query({
  args: { bulletinId: v.id("bulletins") },
  returns: deliverySummary,
  handler: async (ctx, { bulletinId }) => {
    await requireCan(ctx, "manageBulletins");
    const rows = await ctx.db
      .query("bulletinEmailSends")
      .withIndex("by_bulletin_id", (q) => q.eq("bulletinId", bulletinId))
      .take(ROSTER_LIMIT);

    const counts = { queued: 0, sent: 0, delivered: 0, bounced: 0, failed: 0 };
    for (const row of rows) counts[row.status] += 1;

    const problems = await Promise.all(
      rows
        .filter((row) => row.status === "bounced" || row.status === "failed")
        .map(async (row) => ({
          memberName: (await ctx.db.get("members", row.memberId))?.name ?? UNKNOWN_MEMBER,
          status: row.status,
          error: row.error ?? null,
        })),
    );

    return { ...counts, truncated: rows.length === ROSTER_LIMIT, problems };
  },
});

// The address Resend must deliver webhook events to, derived from the
// deployment itself so setup never asks a human to copy it out of a
// dashboard: `npx convex run bulletinEmails:webhookEndpoint --prod` is what
// scripts/setup/bulletin-email.sh calls. CONVEX_SITE_URL is the `.convex.site`
// host every deployment exposes for HTTP actions.
export const webhookEndpoint = internalQuery({
  args: {},
  returns: v.string(),
  handler: async () => {
    const site = process.env.CONVEX_SITE_URL;
    if (!site) throw new Error("CONVEX_SITE_URL is not set on this deployment");
    return `${site.replace(/\/+$/, "")}${RESEND_WEBHOOK_PATH}`;
  },
});
