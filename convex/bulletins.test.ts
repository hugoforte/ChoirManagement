/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

const ISSUER = "https://example.clerk.accounts.dev";
const adminIdentity = { subject: "admin_1", issuer: ISSUER };
const directorIdentity = { subject: "director_1", issuer: ISSUER };
const choristerIdentity = { subject: "chorister_1", issuer: ISSUER };

async function seedMembers(t: ReturnType<typeof convexTest>) {
  const [adminId, directorId, choristerId] = await Promise.all([
    t.run(async (ctx) =>
      ctx.db.insert("members", {
        clerkUserId: `${ISSUER}|admin_1`,
        name: "Ada Admin",
        email: "ada@example.com",
        role: "admin",
      }),
    ),
    t.run(async (ctx) =>
      ctx.db.insert("members", {
        clerkUserId: `${ISSUER}|director_1`,
        name: "Dana Director",
        email: "dana@example.com",
        role: "director",
      }),
    ),
    t.run(async (ctx) =>
      ctx.db.insert("members", {
        clerkUserId: `${ISSUER}|chorister_1`,
        name: "Chris Chorister",
        email: "chris@example.com",
        role: "chorister",
      }),
    ),
  ]);
  return { adminId, directorId, choristerId };
}

async function insertEvent(t: ReturnType<typeof convexTest>, title: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("events", {
      title,
      description: undefined,
      startsAt: 0,
      location: undefined,
      youtubeUrl: undefined,
      setlist: [],
      visibility: "private",
    }),
  );
}

test("createDraft refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.bulletins.createDraft, { title: "Not allowed" }),
  ).rejects.toThrow(/Requires capability: manageBulletins/);
});

test("createDraft creates an unpublished Bulletin with an empty body", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const before = Date.now();

  const bulletinId = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.createDraft, { title: "Rehearsal notes" });

  const bulletin = await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId));
  expect(bulletin).toMatchObject({
    title: "Rehearsal notes",
    body: "",
    status: "draft",
    createdByMemberId: directorId,
  });
  expect(bulletin?.publishedAt).toBeUndefined();
  expect(bulletin?.updatedAt).toBeGreaterThanOrEqual(before);
});

test("listAll shows drafts to a manager, newest drafts before published Bulletins", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);

  const older = await asDirector.mutation(api.bulletins.createDraft, { title: "Older draft" });
  const newer = await asDirector.mutation(api.bulletins.createDraft, { title: "Newer draft" });
  await asDirector.mutation(api.bulletins.publish, { bulletinId: older });

  const list = await asDirector.query(api.bulletins.listAll, {});
  expect(list.map((b) => b._id)).toEqual([newer, older]);
  expect(list.map((b) => b.status)).toEqual(["draft", "published"]);
});

test("listAll refuses a Chorister, so drafts are never readable without manageBulletins", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  await t.withIdentity(directorIdentity).mutation(api.bulletins.createDraft, { title: "Secret draft" });

  await expect(t.withIdentity(choristerIdentity).query(api.bulletins.listAll, {})).rejects.toThrow(
    /Requires capability: manageBulletins/,
  );
});

test("listAll resolves the anchored Event's title, and null when there is no anchor", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const eventId = await insertEvent(t, "Spring Concert");

  const anchored = await asDirector.mutation(api.bulletins.createDraft, { title: "Anchored" });
  await asDirector.mutation(api.bulletins.update, { bulletinId: anchored, eventId });
  await asDirector.mutation(api.bulletins.createDraft, { title: "Standalone" });

  const list = await asDirector.query(api.bulletins.listAll, {});
  const byTitle = new Map(list.map((b) => [b.title, b.eventTitle]));
  expect(byTitle.get("Anchored")).toBe("Spring Concert");
  expect(byTitle.get("Standalone")).toBeNull();
});

test("get returns the Bulletin for a manager and refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Draft" });

  const bulletin = await asDirector.query(api.bulletins.get, { bulletinId });
  expect(bulletin).toMatchObject({ title: "Draft", status: "draft" });

  await expect(t.withIdentity(choristerIdentity).query(api.bulletins.get, { bulletinId })).rejects.toThrow(
    /Requires capability: manageBulletins/,
  );
});

test("publish sets publishedAt once and a second publish throws", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });

  await asDirector.mutation(api.bulletins.publish, { bulletinId });
  const published = await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId));
  expect(published?.status).toBe("published");
  expect(published?.publishedAt).toEqual(expect.any(Number));

  await expect(asDirector.mutation(api.bulletins.publish, { bulletinId })).rejects.toThrow(
    /already published/,
  );
  const unchanged = await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId));
  expect(unchanged?.publishedAt).toBe(published?.publishedAt);
});

test("publish refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const bulletinId = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.createDraft, { title: "Notes" });

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.bulletins.publish, { bulletinId }),
  ).rejects.toThrow(/Requires capability: manageBulletins/);
});

test("an edit after publishing bumps updatedAt but leaves publishedAt alone", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  await asDirector.mutation(api.bulletins.publish, { bulletinId });
  const atPublish = await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId));

  // Publishing sets updatedAt and publishedAt to the same instant, so the
  // "edited" badge (updatedAt > publishedAt) must not show yet.
  expect(atPublish?.updatedAt).toBe(atPublish?.publishedAt);

  await t.run(async (ctx) => await ctx.db.patch("bulletins", bulletinId, { updatedAt: 1 }));
  await asDirector.mutation(api.bulletins.update, { bulletinId, body: "Call time is 6:45." });

  const edited = await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId));
  expect(edited?.publishedAt).toBe(atPublish?.publishedAt);
  expect(edited?.updatedAt).toBeGreaterThan(atPublish!.publishedAt!);
  expect(edited?.status).toBe("published");
});

test("saving an unchanged published Bulletin does not mark it edited", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  await asDirector.mutation(api.bulletins.update, { bulletinId, body: "Call time is 6:45." });
  await asDirector.mutation(api.bulletins.publish, { bulletinId });
  // Backdate both timestamps, so a bump would be unmistakable rather than
  // hidden by the two mutations landing within the same millisecond.
  await t.run(
    async (ctx) => await ctx.db.patch("bulletins", bulletinId, { publishedAt: 500, updatedAt: 500 }),
  );

  // The editor posts the whole form on every Save, so a Director opening a
  // published Bulletin and pressing Save without typing must not stamp it.
  await asDirector.mutation(api.bulletins.update, {
    bulletinId,
    title: "Notes",
    body: "Call time is 6:45.",
    eventId: null,
  });

  const after = await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId));
  expect(after?.updatedAt).toBe(500);
});

test("listAll labels every Bulletin sharing one Event anchor with that Event's title", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const eventId = await insertEvent(t, "Spring Concert");
  for (const title of ["First", "Second", "Third"]) {
    const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title });
    await asDirector.mutation(api.bulletins.update, { bulletinId, eventId });
  }

  const list = await asDirector.query(api.bulletins.listAll, {});
  expect(list.map((b) => b.eventTitle)).toEqual(["Spring Concert", "Spring Concert", "Spring Concert"]);
});

test("update records the editing Member and can clear the Event anchor", async () => {
  const t = convexTest(schema, modules);
  const { adminId } = await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const eventId = await insertEvent(t, "Spring Concert");
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  await asDirector.mutation(api.bulletins.update, { bulletinId, eventId });

  await t.withIdentity(adminIdentity).mutation(api.bulletins.update, { bulletinId, eventId: null });

  const bulletin = await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId));
  expect(bulletin?.eventId).toBeUndefined();
  expect(bulletin?.updatedByMemberId).toBe(adminId);
});

test("update refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const bulletinId = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.createDraft, { title: "Notes" });

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.bulletins.update, { bulletinId, title: "Hijacked" }),
  ).rejects.toThrow(/Requires capability: manageBulletins/);
});

test("a Director may delete a draft", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Scrap this" });

  await asDirector.mutation(api.bulletins.remove, { bulletinId });

  expect(await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId))).toBeNull();
});

test("a Director may not delete a published Bulletin, but an Admin may", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  await asDirector.mutation(api.bulletins.publish, { bulletinId });

  await expect(asDirector.mutation(api.bulletins.remove, { bulletinId })).rejects.toThrow(
    /Requires capability: deletePublishedBulletins/,
  );
  expect(await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId))).not.toBeNull();

  await t.withIdentity(adminIdentity).mutation(api.bulletins.remove, { bulletinId });
  expect(await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId))).toBeNull();
});

test("remove refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const bulletinId = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.createDraft, { title: "Notes" });

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.bulletins.remove, { bulletinId }),
  ).rejects.toThrow(/Requires capability: manageBulletins/);
});

// --- The Member-facing read side (#82) ------------------------------------

// Rows are inserted directly rather than through createDraft/publish so each
// test can pin publishedAt: the unread marker is entirely a comparison of two
// stored instants, and asserting it against Date.now() would be a race.
async function insertBulletin(
  t: ReturnType<typeof convexTest>,
  bulletin: {
    title: string;
    createdByMemberId: Id<"members">;
    publishedAt?: number;
    eventId?: Id<"events">;
    body?: string;
    updatedAt?: number;
  },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("bulletins", {
      title: bulletin.title,
      body: bulletin.body ?? "",
      eventId: bulletin.eventId,
      status: bulletin.publishedAt === undefined ? "draft" : "published",
      publishedAt: bulletin.publishedAt,
      updatedAt: bulletin.updatedAt ?? bulletin.publishedAt ?? 0,
      createdByMemberId: bulletin.createdByMemberId,
      updatedByMemberId: undefined,
      shareLink: undefined,
    }),
  );
}

const firstPage = { paginationOpts: { numItems: 20, cursor: null } };

// Managers included, deliberately: a draft is unreachable from the reading
// routes for every Role, so the manage route stays the only way to open one.
test.each([
  ["a Chorister", choristerIdentity],
  ["a Director", directorIdentity],
  ["an Admin", adminIdentity],
])("listPublished hides drafts from %s", async (_label, identity) => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  await insertBulletin(t, { title: "Still writing", createdByMemberId: directorId });
  await insertBulletin(t, { title: "Out already", createdByMemberId: directorId, publishedAt: 1_000 });

  const result = await t.withIdentity(identity).query(api.bulletins.listPublished, firstPage);

  expect(result.page.map((b) => b.title)).toEqual(["Out already"]);
});

test("listPublished returns the newest publish first", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  await insertBulletin(t, { title: "Older", createdByMemberId: directorId, publishedAt: 1_000 });
  await insertBulletin(t, { title: "Newer", createdByMemberId: directorId, publishedAt: 2_000 });

  const result = await t.withIdentity(choristerIdentity).query(api.bulletins.listPublished, firstPage);

  expect(result.page.map((b) => b.title)).toEqual(["Newer", "Older"]);
});

test("listPublished labels each row with its anchored Event", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const eventId = await insertEvent(t, "Tuesday Rehearsal");
  await insertBulletin(t, { title: "Anchored", createdByMemberId: directorId, publishedAt: 2_000, eventId });
  await insertBulletin(t, { title: "Standalone", createdByMemberId: directorId, publishedAt: 1_000 });

  const result = await t.withIdentity(choristerIdentity).query(api.bulletins.listPublished, firstPage);

  expect(result.page.map((b) => [b.title, b.eventTitle])).toEqual([
    ["Anchored", "Tuesday Rehearsal"],
    ["Standalone", null],
  ]);
});

test("listPublished refuses a caller who isn't a Member", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);

  await expect(t.query(api.bulletins.listPublished, firstPage)).rejects.toThrow(/Not signed in/);
});

test.each([
  ["a Chorister", choristerIdentity],
  ["a Director", directorIdentity],
  ["an Admin", adminIdentity],
])("getPublished refuses a draft to %s", async (_label, identity) => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, { title: "Still writing", createdByMemberId: directorId });

  expect(await t.withIdentity(identity).query(api.bulletins.getPublished, { bulletinId })).toBeNull();
});

test("getPublished returns a published Bulletin with its body and Event", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const eventId = await insertEvent(t, "Tuesday Rehearsal");
  const bulletinId = await insertBulletin(t, {
    title: "Rehearsal notes",
    createdByMemberId: directorId,
    publishedAt: 1_000,
    updatedAt: 5_000,
    body: "## Bring your Palestrina",
    eventId,
  });

  const bulletin = await t.withIdentity(choristerIdentity).query(api.bulletins.getPublished, { bulletinId });

  expect(bulletin).toEqual({
    _id: bulletinId,
    title: "Rehearsal notes",
    body: "## Bring your Palestrina",
    publishedAt: 1_000,
    updatedAt: 5_000,
    eventId,
    eventTitle: "Tuesday Rehearsal",
  });
});

// The Share Link token is a bearer credential (ADR-0004); the reading view
// has no use for it, so it must not ride along on a read every Member makes.
test("getPublished does not expose the Share Link token", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, {
    title: "Shared",
    createdByMemberId: directorId,
    publishedAt: 1_000,
  });
  await t.run(async (ctx) =>
    ctx.db.patch("bulletins", bulletinId, { shareLink: { token: "secret-token", mode: "token" } }),
  );

  const bulletin = await t.withIdentity(choristerIdentity).query(api.bulletins.getPublished, { bulletinId });

  expect(JSON.stringify(bulletin)).not.toContain("secret-token");
});

async function setLastRead(t: ReturnType<typeof convexTest>, memberId: Id<"members">, at: number) {
  await t.run(async (ctx) => ctx.db.patch("members", memberId, { lastReadBulletinsAt: at }));
}

test("hasUnread is true when a Bulletin was published after the Member last looked", async () => {
  const t = convexTest(schema, modules);
  const { directorId, choristerId } = await seedMembers(t);
  await setLastRead(t, choristerId, 1_000);
  await insertBulletin(t, { title: "Since", createdByMemberId: directorId, publishedAt: 2_000 });

  expect(await t.withIdentity(choristerIdentity).query(api.bulletins.hasUnread, {})).toBe(true);
});

test("hasUnread is false when the newest publish predates the Member's last look", async () => {
  const t = convexTest(schema, modules);
  const { directorId, choristerId } = await seedMembers(t);
  await setLastRead(t, choristerId, 3_000);
  await insertBulletin(t, { title: "Before", createdByMemberId: directorId, publishedAt: 2_000 });

  expect(await t.withIdentity(choristerIdentity).query(api.bulletins.hasUnread, {})).toBe(false);
});

test("hasUnread is true for a Member who has never opened the list", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  await insertBulletin(t, { title: "Anything", createdByMemberId: directorId, publishedAt: 2_000 });

  expect(await t.withIdentity(choristerIdentity).query(api.bulletins.hasUnread, {})).toBe(true);
});

test("hasUnread is false when nothing is published, however old the draft", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  await insertBulletin(t, { title: "Still writing", createdByMemberId: directorId });

  expect(await t.withIdentity(choristerIdentity).query(api.bulletins.hasUnread, {})).toBe(false);
});

test("markBulletinsRead advances the caller's own timestamp and nobody else's", async () => {
  const t = convexTest(schema, modules);
  const { choristerId, directorId } = await seedMembers(t);

  await t.withIdentity(choristerIdentity).mutation(api.bulletins.markBulletinsRead, { now: 4_000 });

  const chorister = await t.run(async (ctx) => await ctx.db.get("members", choristerId));
  const director = await t.run(async (ctx) => await ctx.db.get("members", directorId));
  expect(chorister?.lastReadBulletinsAt).toBe(4_000);
  expect(director?.lastReadBulletinsAt).toBeUndefined();
});

test("markBulletinsRead clears the unread marker", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  await insertBulletin(t, { title: "Fresh", createdByMemberId: directorId, publishedAt: 2_000 });
  const asChorister = t.withIdentity(choristerIdentity);
  expect(await asChorister.query(api.bulletins.hasUnread, {})).toBe(true);

  await asChorister.mutation(api.bulletins.markBulletinsRead, { now: 3_000 });

  expect(await asChorister.query(api.bulletins.hasUnread, {})).toBe(false);
});
