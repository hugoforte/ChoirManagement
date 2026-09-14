/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";

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
