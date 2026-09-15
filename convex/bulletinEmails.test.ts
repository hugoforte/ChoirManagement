/// <reference types="vite/client" />
//
// The email a Bulletin sends on publish (#52).
//
// Two things these tests deliberately do not do. They never reach the Resend
// component: `sendQueuedBulletinEmails` takes its sender as an argument, so
// the interesting behaviour — what happens to a row whose send throws — is
// driven directly instead of through a mail provider that isn't there. And
// they set the three env vars by hand, because "this deployment has no mail
// provider" is a supported state that has to be tested as carefully as the
// configured one.
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  handleResendWebhook,
  reconcileBulletinEmails,
  resendWebhookSecret,
  sendQueuedBulletinEmails,
  type BulletinEmailSender,
  type BulletinEmailStatusReader,
} from "./bulletinEmails";
import type { EmailId } from "@convex-dev/resend";

const modules = import.meta.glob("./**/*.ts");

const ISSUER = "https://example.clerk.accounts.dev";
const adminIdentity = { subject: "admin_1", issuer: ISSUER };
const directorIdentity = { subject: "director_1", issuer: ISSUER };
const choristerIdentity = { subject: "chorister_1", issuer: ISSUER };

const EMAIL_ENV = {
  RESEND_API_KEY: "re_test_key",
  BULLETINS_FROM_EMAIL: "Choir <bulletins@example.org>",
  APP_BASE_URL: "https://choir.example.org",
};

function configureEmail() {
  for (const [name, value] of Object.entries(EMAIL_ENV)) vi.stubEnv(name, value);
}

function unconfigureEmail() {
  for (const name of Object.keys(EMAIL_ENV)) vi.stubEnv(name, "");
}

// Every test states its own environment; nothing leaks between them.
//
// Fake timers keep `publish`'s scheduled send action parked: these tests
// drive the send loop themselves with a substituted provider, and letting
// the real one fire would reach for a Resend component that is not
// registered in this runtime.
beforeEach(() => {
  unconfigureEmail();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type Test = TestConvex<typeof schema>;

async function seedMembers(t: Test) {
  const directorId = await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: `${ISSUER}|director_1`,
      name: "Dana Director",
      email: "dana@example.com",
      role: "director" as const,
    }),
  );
  const choristerId = await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: `${ISSUER}|chorister_1`,
      name: "Chris Chorister",
      email: "chris@example.com",
      role: "chorister" as const,
    }),
  );
  return { directorId, choristerId };
}

// The webhook resolves a row by its provider message id, which is unique per
// email. Tests that deliver an event leave exactly one recipient on the
// roster so there is exactly one row to resolve.
async function optOut(t: Test, memberId: Id<"members">) {
  await t.run(async (ctx) => ctx.db.patch("members", memberId, { emailBulletins: false }));
}

async function draftBulletin(t: Test, title = "This week") {
  return await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.createDraft, { title });
}

async function sendRows(t: Test, bulletinId: Id<"bulletins">): Promise<Doc<"bulletinEmailSends">[]> {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("bulletinEmailSends")
        .withIndex("by_bulletin_id", (q) => q.eq("bulletinId", bulletinId))
        .collect(),
  );
}

// ---------------------------------------------------------------------------
// Queueing at publish time

test("publish with sendEmail false queues nothing", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const bulletinId = await draftBulletin(t);

  const queued = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.publish, { bulletinId, sendEmail: false });

  expect(queued).toBe(0);
  expect(await sendRows(t, bulletinId)).toEqual([]);
});

test("publish with sendEmail true queues one row per Member", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { directorId, choristerId } = await seedMembers(t);
  const bulletinId = await draftBulletin(t);

  const queued = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.publish, { bulletinId, sendEmail: true });

  expect(queued).toBe(2);
  const rows = await sendRows(t, bulletinId);
  expect(rows.map((row) => row.memberId).sort()).toEqual([directorId, choristerId].sort());
  expect(rows.every((row) => row.status === "queued")).toBe(true);
});

test("publish skips a Member who opted out of Bulletin email", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { directorId, choristerId } = await seedMembers(t);
  await t.run(async (ctx) => ctx.db.patch("members", choristerId, { emailBulletins: false }));
  const bulletinId = await draftBulletin(t);

  await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.publish, { bulletinId, sendEmail: true });

  expect((await sendRows(t, bulletinId)).map((row) => row.memberId)).toEqual([directorId]);
});

test("publish queues nothing when no mail provider is configured", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const bulletinId = await draftBulletin(t);

  // The publish itself still succeeds — a self-hoster without a provider
  // gets a working app, not a broken publish button.
  const queued = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.publish, { bulletinId, sendEmail: true });

  expect(queued).toBe(0);
  expect(await sendRows(t, bulletinId)).toEqual([]);
  const bulletin = await t.withIdentity(directorIdentity).query(api.bulletins.get, { bulletinId });
  expect(bulletin?.status).toBe("published");
});

test("a Member with no email address on file is recorded as failed, not skipped", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await t.run(async (ctx) => ctx.db.patch("members", choristerId, { email: "" }));
  const bulletinId = await draftBulletin(t);

  const queued = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.publish, { bulletinId, sendEmail: true });

  expect(queued).toBe(1);
  const failed = (await sendRows(t, bulletinId)).find((row) => row.memberId === choristerId);
  expect(failed?.status).toBe("failed");
  expect(failed?.error).toMatch(/No email address/);
});

// ---------------------------------------------------------------------------
// The per-Member preference

test("setEmailBulletins patches only the caller", async () => {
  const t = convexTest(schema, modules);
  const { directorId, choristerId } = await seedMembers(t);

  await t.withIdentity(choristerIdentity).mutation(api.members.setEmailBulletins, { enabled: false });

  const [director, chorister] = await t.run(async (ctx) => [
    await ctx.db.get("members", directorId),
    await ctx.db.get("members", choristerId),
  ]);
  expect(chorister?.emailBulletins).toBe(false);
  expect(director?.emailBulletins).toBeUndefined();
});

test("setEmailBulletins refuses a caller with no Member record", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);

  await expect(
    t.withIdentity({ subject: "stranger", issuer: ISSUER }).mutation(api.members.setEmailBulletins, {
      enabled: false,
    }),
  ).rejects.toThrow(/Not signed in/);
});

// ---------------------------------------------------------------------------
// Sending

// The send loop runs as an action in production, but all it asks of its
// context is `runQuery` and `runMutation` — both of which convex-test's
// `t.run` provides. The two generated context types declare those methods
// with incompatible optional-argument shapes, so there is no type both
// satisfy; this one cast is what lets the failure paths be driven directly
// instead of through a mail provider that isn't there.
function asSendCtx(ctx: { runQuery: unknown; runMutation: unknown }): ActionCtx {
  return ctx as unknown as ActionCtx;
}

// The provider seam. These fakes ignore the context they are handed, which
// is the point — nothing below needs a mail provider to exist.
function senderReturning(id: string): BulletinEmailSender {
  return async () => id;
}

function senderThrowing(message: string): BulletinEmailSender {
  return async () => {
    throw new Error(message);
  };
}

async function publishAndSend(t: Test, send: BulletinEmailSender, shareToken?: string) {
  const bulletinId = await draftBulletin(t);
  await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.update, { bulletinId, body: "**Call time** is 6:45." });
  if (shareToken) {
    await t.run(async (ctx) =>
      ctx.db.patch("bulletins", bulletinId, { shareLink: { token: shareToken, mode: "token" } }),
    );
  }
  await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.publish, { bulletinId, sendEmail: true });
  await t.run(async (ctx) => sendQueuedBulletinEmails(asSendCtx(ctx), bulletinId, send));
  return bulletinId;
}

test("a successful send marks its row sent and records the provider message id", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  await seedMembers(t);

  const bulletinId = await publishAndSend(t, senderReturning("email_abc"));

  const rows = await sendRows(t, bulletinId);
  expect(rows.every((row) => row.status === "sent")).toBe(true);
  expect(rows.every((row) => row.providerMessageId === "email_abc")).toBe(true);
});

test("a send that throws marks the row failed with the error text", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  await seedMembers(t);

  const bulletinId = await publishAndSend(t, senderThrowing("Resend rejected the sender domain"));

  const rows = await sendRows(t, bulletinId);
  expect(rows.every((row) => row.status === "failed")).toBe(true);
  expect(rows[0].error).toBe("Resend rejected the sender domain");
});

test("one failing recipient does not cost the others their email", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);

  let call = 0;
  const flaky: BulletinEmailSender = async (_ctx, email) => {
    call += 1;
    if (email.to === "chris@example.com") throw new Error("Mailbox full");
    return `email_${call}`;
  };
  const bulletinId = await publishAndSend(t, flaky);

  const rows = await sendRows(t, bulletinId);
  const chorister = rows.find((row) => row.memberId === choristerId);
  expect(chorister?.status).toBe("failed");
  expect(rows.filter((row) => row.status === "sent")).toHaveLength(1);
});

test("the email links to the Share Link when one exists, else to the Bulletin", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  await seedMembers(t);

  const sentHtml: string[] = [];
  const capture: BulletinEmailSender = async (_ctx, email) => {
    sentHtml.push(email.html);
    return "email_1";
  };

  const withoutShare = await publishAndSend(t, capture);
  expect(sentHtml[0]).toContain(`${EMAIL_ENV.APP_BASE_URL}/bulletins/${withoutShare}`);

  sentHtml.length = 0;
  await publishAndSend(t, capture, "share-token-1");
  expect(sentHtml[0]).toContain(`${EMAIL_ENV.APP_BASE_URL}/s/share-token-1`);
});

test("the email renders the Bulletin's Markdown and carries a plain-text alternative", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  await seedMembers(t);

  const sent: { subject: string; html: string; text: string }[] = [];
  const capture: BulletinEmailSender = async (_ctx, email) => {
    sent.push({ subject: email.subject, html: email.html, text: email.text });
    return "email_1";
  };
  await publishAndSend(t, capture);

  expect(sent[0].subject).toBe("This week");
  expect(sent[0].html).toContain("<strong>Call time</strong>");
  expect(sent[0].text).toContain("**Call time** is 6:45.");
});

test("sending with the provider unconfigured marks every row failed rather than losing it", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const bulletinId = await draftBulletin(t);
  await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.publish, { bulletinId, sendEmail: true });

  // The key was pulled between publishing and the scheduled action running.
  unconfigureEmail();
  await t.run(async (ctx) =>
    sendQueuedBulletinEmails(asSendCtx(ctx), bulletinId, senderReturning("unused")),
  );

  const rows = await sendRows(t, bulletinId);
  expect(rows.every((row) => row.status === "failed")).toBe(true);
  expect(rows[0].error).toMatch(/not configured/i);
});

// ---------------------------------------------------------------------------
// Delivery feedback from the webhook

const webhookCommon = {
  created_at: "2026-01-01T00:00:00.000Z",
  email_id: "resend_1",
  from: "Choir <bulletins@example.org>",
  to: "dana@example.com",
  subject: "This week",
};

// The component's EmailEvent union is wide and its narrow variants are not
// exported individually, so webhook payloads are built as plain objects and
// handed to the validator, which is what a real webhook does too.
type WebhookEvent = Record<string, unknown>;

async function deliverEvent(t: Test, id: string, event: WebhookEvent) {
  await t.mutation(internal.bulletinEmails.handleEmailEvent, {
    id: id as EmailId,
    event: event as never,
  });
}

async function publishSendAndEvent(t: Test, event: WebhookEvent) {
  const bulletinId = await publishAndSend(t, senderReturning("email_abc"));
  await deliverEvent(t, "email_abc", event);
  return bulletinId;
}

test("a bounce event marks the matching row bounced with the bounce message", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);

  const bulletinId = await publishSendAndEvent(t, {
    type: "email.bounced",
    created_at: webhookCommon.created_at,
    data: {
      ...webhookCommon,
      bounce: { message: "Mailbox does not exist", subType: "NoEmail", type: "Permanent" },
    },
  });

  const rows = await sendRows(t, bulletinId);
  expect(rows.every((row) => row.status === "bounced")).toBe(true);
  expect(rows[0].error).toBe("Mailbox does not exist");
});

test("a delivered event marks the matching row delivered", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);

  const bulletinId = await publishSendAndEvent(t, {
    type: "email.delivered",
    created_at: webhookCommon.created_at,
    data: webhookCommon,
  });

  expect((await sendRows(t, bulletinId)).every((row) => row.status === "delivered")).toBe(true);
});

test("a late email.sent event never walks a delivered row backwards", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);

  const bulletinId = await publishSendAndEvent(t, {
    type: "email.delivered",
    created_at: webhookCommon.created_at,
    data: webhookCommon,
  });
  await deliverEvent(t, "email_abc", {
    type: "email.sent",
    created_at: webhookCommon.created_at,
    data: webhookCommon,
  });

  expect((await sendRows(t, bulletinId)).every((row) => row.status === "delivered")).toBe(true);
});

test("an event for an unknown provider message id is ignored", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);
  const bulletinId = await publishAndSend(t, senderReturning("email_abc"));

  await deliverEvent(t, "email_not_ours", {
    type: "email.bounced",
    created_at: webhookCommon.created_at,
    data: {
      ...webhookCommon,
      bounce: { message: "nope", subType: "NoEmail", type: "Permanent" },
    },
  });

  expect((await sendRows(t, bulletinId)).every((row) => row.status === "sent")).toBe(true);
});

// ---------------------------------------------------------------------------
// The Director-facing read

test("summaryForBulletin counts every status and names the failed recipients", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  await seedMembers(t);

  const failChris: BulletinEmailSender = async (_ctx, email) => {
    if (email.to === "chris@example.com") throw new Error("Mailbox full");
    return "email_dana";
  };
  const bulletinId = await publishAndSend(t, failChris);

  const summary = await t
    .withIdentity(directorIdentity)
    .query(api.bulletinEmails.summaryForBulletin, { bulletinId });

  expect(summary.sent).toBe(1);
  expect(summary.failed).toBe(1);
  expect(summary.problems).toEqual([
    { memberName: "Chris Chorister", status: "failed", error: "Mailbox full" },
  ]);
});

test("summaryForBulletin refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const bulletinId = await draftBulletin(t);

  await expect(
    t
      .withIdentity(choristerIdentity)
      .query(api.bulletinEmails.summaryForBulletin, { bulletinId }),
  ).rejects.toThrow(/Requires capability: manageBulletins/);
});

test("isConfigured reports the deployment's mail provider state", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);

  expect(await asDirector.query(api.bulletinEmails.isConfigured, {})).toBe(false);
  configureEmail();
  expect(await asDirector.query(api.bulletinEmails.isConfigured, {})).toBe(true);
});

// A Chorister reads this to decide whether to show their own opt-out.
test("isConfigured is readable by any Member", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  await seedMembers(t);

  expect(await t.withIdentity(choristerIdentity).query(api.bulletinEmails.isConfigured, {})).toBe(
    true,
  );
});

test("deleting a Bulletin takes its delivery rows with it", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  await seedMembers(t);
  await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: `${ISSUER}|admin_1`,
      name: "Ada Admin",
      email: "ada@example.com",
      role: "admin" as const,
    }),
  );
  const bulletinId = await publishAndSend(t, senderReturning("email_abc"));
  expect(await sendRows(t, bulletinId)).not.toEqual([]);

  // Deleting a published Bulletin is admin-only (#49).
  await t.withIdentity(adminIdentity).mutation(api.bulletins.remove, { bulletinId });
  expect(await sendRows(t, bulletinId)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Reconciliation
//
// The gap this closes: `sendEmail` only enqueues into the component's
// workpool. The POST to Resend happens later, and a permanent rejection there
// — a bad key, an unverified sender domain — marks the component's own record
// failed without ever calling `onEmailEvent`, which fires for webhook events
// only. Left alone, our row would read "handed to provider" forever for mail
// Resend refused. This is the first failure a new deployment hits.

function statusReader(
  readings: Record<string, { status: string; errorMessage: string | null } | null>,
): BulletinEmailStatusReader {
  return async (_ctx, providerMessageId) => readings[providerMessageId] ?? null;
}

async function reconcileOnce(
  t: Test,
  bulletinId: Id<"bulletins">,
  readStatus: BulletinEmailStatusReader,
) {
  await t.run(async (ctx) =>
    reconcileBulletinEmails(asSendCtx(ctx), bulletinId, 0, readStatus),
  );
}

test("a permanent provider rejection ends as failed with the provider's reason", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);

  // The send itself succeeded: the email was accepted into the queue.
  const bulletinId = await publishAndSend(t, senderReturning("email_abc"));
  expect((await sendRows(t, bulletinId))[0].status).toBe("sent");

  await reconcileOnce(
    t,
    bulletinId,
    statusReader({
      email_abc: { status: "failed", errorMessage: "The example.org domain is not verified" },
    }),
  );

  const row = (await sendRows(t, bulletinId))[0];
  expect(row.status).toBe("failed");
  expect(row.error).toBe("The example.org domain is not verified");
});

test("a bounce discovered by reconciliation is recorded even with no webhook", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);
  const bulletinId = await publishAndSend(t, senderReturning("email_abc"));

  await reconcileOnce(
    t,
    bulletinId,
    statusReader({ email_abc: { status: "bounced", errorMessage: "Mailbox does not exist" } }),
  );

  const row = (await sendRows(t, bulletinId))[0];
  expect(row.status).toBe("bounced");
  expect(row.error).toBe("Mailbox does not exist");
});

test("reconciliation advances a confirmed delivery", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);
  const bulletinId = await publishAndSend(t, senderReturning("email_abc"));

  await reconcileOnce(
    t,
    bulletinId,
    statusReader({ email_abc: { status: "delivered", errorMessage: null } }),
  );

  expect((await sendRows(t, bulletinId))[0].status).toBe("delivered");
});

test("reconciliation leaves a row alone while the provider is still working", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);
  const bulletinId = await publishAndSend(t, senderReturning("email_abc"));

  await reconcileOnce(
    t,
    bulletinId,
    statusReader({ email_abc: { status: "delivery_delayed", errorMessage: null } }),
  );

  expect((await sendRows(t, bulletinId))[0].status).toBe("sent");
});

// The component prunes finalized emails on a schedule, so a late pass can
// find nothing. Inventing an outcome would be worse than leaving it.
test("reconciliation leaves a row alone when the provider has no record of it", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);
  const bulletinId = await publishAndSend(t, senderReturning("email_abc"));

  await reconcileOnce(t, bulletinId, statusReader({}));

  expect((await sendRows(t, bulletinId))[0].status).toBe("sent");
});

test("reconciliation never walks a settled row backwards", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);
  const bulletinId = await publishSendAndEvent(t, {
    type: "email.delivered",
    created_at: webhookCommon.created_at,
    data: webhookCommon,
  });

  // A stale reading that still says "sent" must not undo the delivery.
  await reconcileOnce(
    t,
    bulletinId,
    statusReader({ email_abc: { status: "sent", errorMessage: null } }),
  );

  expect((await sendRows(t, bulletinId))[0].status).toBe("delivered");
});

test("a row that never reached the provider is not reconciled against it", async () => {
  configureEmail();
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  await optOut(t, choristerId);
  const bulletinId = await publishAndSend(t, senderThrowing("Connection refused"));

  // No providerMessageId, so there is nothing to ask about; the local error
  // stands rather than being overwritten.
  await reconcileOnce(
    t,
    bulletinId,
    statusReader({ email_abc: { status: "delivered", errorMessage: null } }),
  );

  const row = (await sendRows(t, bulletinId))[0];
  expect(row.status).toBe("failed");
  expect(row.error).toBe("Connection refused");
});

// ---------------------------------------------------------------------------
// The webhook endpoint's own responses

test("resendWebhookSecret reports an unconfigured deployment", () => {
  expect(resendWebhookSecret()).toBe("");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test");
  expect(resendWebhookSecret()).toBe("whsec_test");
});

// A public URL gets poked. An unsigned POST is a refusal, not a server fault:
// a 500 would tell Resend to keep retrying something that can never succeed.
test("an unsigned webhook request is refused with 401, not a 500", async () => {
  configureEmail();
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0");
  const t = convexTest(schema, modules);

  // `t.run` serialises what its callback returns, and a Response is not a
  // Convex value — read it inside and hand back plain fields.
  const { status, body } = await t.run(async (ctx) => {
    const response = await handleResendWebhook(
      asSendCtx(ctx),
      new Request("https://example.convex.site/resend-webhook", {
        method: "POST",
        body: JSON.stringify({ type: "email.delivered" }),
      }),
    );
    return { status: response.status, body: await response.text() };
  });

  expect(status).toBe(401);
  expect(body).toBe("Invalid signature");
});
