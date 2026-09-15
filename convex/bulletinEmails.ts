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
import { Resend, vOnEmailEventArgs, type EmailEvent } from "@convex-dev/resend";

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
} from "./lib/bulletinEmail";
import schema from "./schema";

const sendStatus = schema.tables.bulletinEmailSends.validator.fields.status;

// Roster-sized reads. A choir is not an unbounded user base, but `.collect()`
// on a table nobody bounds is how a query stops scaling quietly, so both
// reads here take a ceiling.
const ROSTER_LIMIT = 500;

const NOT_CONFIGURED = "Email is not configured for this deployment";
const NO_ADDRESS = "No email address on file for this Member";

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
export async function handleResendWebhook(ctx: ActionCtx, request: Request): Promise<Response> {
  return await resendClient().handleResendEventWebhook(ctx, request);
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
  return null;
}

export const sendQueued = internalAction({
  args: { bulletinId: v.id("bulletins") },
  returns: v.null(),
  handler: async (ctx, { bulletinId }) =>
    await sendQueuedBulletinEmails(ctx, bulletinId, sendThroughResend),
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
    // `email.sent` can arrive after `email.delivered` — the events are not
    // ordered — and re-stamping a delivered row as merely sent would lose
    // the outcome. Nothing ever moves back out of a terminal status.
    if (update.status === "sent" && row.status !== "queued") return null;

    await ctx.db.patch("bulletinEmailSends", row._id, { ...update, updatedAt: Date.now() });
    return null;
  },
});

type SendStatus = Doc<"bulletinEmailSends">["status"];

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

    return { ...counts, problems };
  },
});
