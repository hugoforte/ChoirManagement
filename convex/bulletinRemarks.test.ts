/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

const ISSUER = "https://example.clerk.accounts.dev";
const directorIdentity = { subject: "director_1", issuer: ISSUER };
const choristerIdentity = { subject: "chorister_1", issuer: ISSUER };

async function seedMembers(t: ReturnType<typeof convexTest>) {
  await Promise.all([
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
}

async function insertPiece(t: ReturnType<typeof convexTest>, title: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("pieces", {
      title,
      composer: undefined,
      arranger: undefined,
      notes: undefined,
      youtubeUrl: undefined,
      files: [],
    }),
  );
}

async function insertEvent(
  t: ReturnType<typeof convexTest>,
  title: string,
  setlist: Id<"pieces">[],
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("events", {
      title,
      description: undefined,
      startsAt: 0,
      location: undefined,
      youtubeUrl: undefined,
      setlist,
      visibility: "private",
    }),
  );
}

test("add refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const pieceId = await insertPiece(t, "Ode to Joy");
  const bulletinId = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletins.createDraft, { title: "Rehearsal notes" });

  await expect(
    t
      .withIdentity(choristerIdentity)
      .mutation(api.bulletinRemarks.add, { bulletinId, pieceId, text: "Not allowed" }),
  ).rejects.toThrow(/Requires capability: manageBulletins/);
});

test("listForBulletin returns Remarks in display order, each with its Piece title", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  const ode = await insertPiece(t, "Ode to Joy");
  const lark = await insertPiece(t, "The Lark Ascending");

  await asDirector.mutation(api.bulletinRemarks.add, {
    bulletinId,
    pieceId: ode,
    text: "Watch the tempo.",
  });
  await asDirector.mutation(api.bulletinRemarks.add, {
    bulletinId,
    pieceId: lark,
    text: "Sopranos, bar 42.",
  });

  const remarks = await asDirector.query(api.bulletinRemarks.listForBulletin, { bulletinId });
  expect(remarks.map((remark) => remark.pieceTitle)).toEqual(["Ode to Joy", "The Lark Ascending"]);
  expect(remarks.map((remark) => remark.displayOrder)).toEqual([0, 1]);
});

test("listPublishedForBulletin gives a Chorister nothing for a draft and the ordered Remarks once published", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const asChorister = t.withIdentity(choristerIdentity);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  const ode = await insertPiece(t, "Ode to Joy");
  const lark = await insertPiece(t, "The Lark Ascending");
  await asDirector.mutation(api.bulletinRemarks.add, {
    bulletinId,
    pieceId: ode,
    text: "Watch the tempo.",
  });
  await asDirector.mutation(api.bulletinRemarks.add, {
    bulletinId,
    pieceId: lark,
    text: "Sopranos, bar 42.",
  });

  // A draft's Remarks stay behind manageBulletins — the reading view shows
  // a Chorister nothing at all until the Bulletin goes out.
  expect(await asChorister.query(api.bulletinRemarks.listPublishedForBulletin, { bulletinId })).toEqual(
    [],
  );

  await asDirector.mutation(api.bulletins.publish, { bulletinId });

  const remarks = await asChorister.query(api.bulletinRemarks.listPublishedForBulletin, {
    bulletinId,
  });
  expect(remarks.map((remark) => remark.pieceTitle)).toEqual(["Ode to Joy", "The Lark Ascending"]);
  expect(remarks.map((remark) => remark.text)).toEqual(["Watch the tempo.", "Sopranos, bar 42."]);
});

test("a Remark may name a Piece that is not on the anchored Event's Setlist", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const onSetlist = await insertPiece(t, "Ode to Joy");
  const offSetlist = await insertPiece(t, "Sicut Cervus");
  const eventId = await insertEvent(t, "Wednesday rehearsal", [onSetlist]);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  await asDirector.mutation(api.bulletins.update, { bulletinId, eventId });

  // Setlist pre-fill is a convenience in the editor, never a constraint on
  // what may be remarked on (#49).
  await asDirector.mutation(api.bulletinRemarks.add, {
    bulletinId,
    pieceId: offSetlist,
    text: "Sight-read this next week.",
  });

  const remarks = await asDirector.query(api.bulletinRemarks.listForBulletin, { bulletinId });
  expect(remarks.map((remark) => remark.pieceTitle)).toEqual(["Sicut Cervus"]);
});

test("listForPiece hides a draft Bulletin's Remarks and shows published ones, newest first", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pieceId = await insertPiece(t, "Ode to Joy");

  const older = await asDirector.mutation(api.bulletins.createDraft, { title: "Older Bulletin" });
  const newer = await asDirector.mutation(api.bulletins.createDraft, { title: "Newer Bulletin" });
  const draft = await asDirector.mutation(api.bulletins.createDraft, { title: "Unfinished" });
  for (const bulletinId of [older, newer, draft]) {
    await asDirector.mutation(api.bulletinRemarks.add, {
      bulletinId,
      pieceId,
      text: `Remark on ${bulletinId}`,
    });
  }
  await asDirector.mutation(api.bulletins.publish, { bulletinId: older });
  await asDirector.mutation(api.bulletins.publish, { bulletinId: newer });
  // Backdate so the ordering is unmistakable rather than two publishes
  // landing in the same millisecond.
  await t.run(async (ctx) => {
    await ctx.db.patch("bulletins", older, { publishedAt: 1_000 });
    await ctx.db.patch("bulletins", newer, { publishedAt: 2_000 });
  });

  const remarks = await t.withIdentity(choristerIdentity).query(api.bulletinRemarks.listForPiece, {
    pieceId,
  });

  expect(remarks.map((remark) => remark.bulletinTitle)).toEqual([
    "Newer Bulletin",
    "Older Bulletin",
  ]);
  expect(remarks.map((remark) => remark.publishedAt)).toEqual([2_000, 1_000]);
});

test("listForPiece refuses someone who is not a Member", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const pieceId = await insertPiece(t, "Ode to Joy");

  await expect(t.query(api.bulletinRemarks.listForPiece, { pieceId })).rejects.toThrow(
    /Not signed in/,
  );
});

test("reorder renumbers the Remarks and rejects a list that is not a permutation", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  const ode = await insertPiece(t, "Ode to Joy");
  const lark = await insertPiece(t, "The Lark Ascending");
  const first = await asDirector.mutation(api.bulletinRemarks.add, {
    bulletinId,
    pieceId: ode,
    text: "First",
  });
  const second = await asDirector.mutation(api.bulletinRemarks.add, {
    bulletinId,
    pieceId: lark,
    text: "Second",
  });

  await expect(
    asDirector.mutation(api.bulletinRemarks.reorder, { bulletinId, remarkIds: [second] }),
  ).rejects.toThrow(/exactly once/);
  await expect(
    asDirector.mutation(api.bulletinRemarks.reorder, {
      bulletinId,
      remarkIds: [second, second],
    }),
  ).rejects.toThrow(/exactly once/);

  await asDirector.mutation(api.bulletinRemarks.reorder, { bulletinId, remarkIds: [second, first] });

  const remarks = await asDirector.query(api.bulletinRemarks.listForBulletin, { bulletinId });
  expect(remarks.map((remark) => remark.text)).toEqual(["Second", "First"]);
});

test("editing a Remark marks its published Bulletin as edited", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pieceId = await insertPiece(t, "Ode to Joy");
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  const remarkId = await asDirector.mutation(api.bulletinRemarks.add, {
    bulletinId,
    pieceId,
    text: "Watch the tempo.",
  });
  await asDirector.mutation(api.bulletins.publish, { bulletinId });
  await t.run(
    async (ctx) => await ctx.db.patch("bulletins", bulletinId, { publishedAt: 500, updatedAt: 500 }),
  );

  // Re-saving the same text is not an edit; changing it is.
  await asDirector.mutation(api.bulletinRemarks.update, { remarkId, text: "Watch the tempo." });
  expect(
    (await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId)))?.updatedAt,
  ).toBe(500);

  await asDirector.mutation(api.bulletinRemarks.update, { remarkId, text: "Watch the tempo at 42." });
  expect(
    (await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId)))?.updatedAt,
  ).toBeGreaterThan(500);
});

test("removing a Remark takes it off the Piece and marks the Bulletin edited", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pieceId = await insertPiece(t, "Ode to Joy");
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  const remarkId = await asDirector.mutation(api.bulletinRemarks.add, {
    bulletinId,
    pieceId,
    text: "Watch the tempo.",
  });
  await asDirector.mutation(api.bulletins.publish, { bulletinId });
  await t.run(
    async (ctx) => await ctx.db.patch("bulletins", bulletinId, { publishedAt: 500, updatedAt: 500 }),
  );

  await asDirector.mutation(api.bulletinRemarks.remove, { remarkId });

  expect(await asDirector.query(api.bulletinRemarks.listForPiece, { pieceId })).toEqual([]);
  expect(
    (await t.run(async (ctx) => await ctx.db.get("bulletins", bulletinId)))?.updatedAt,
  ).toBeGreaterThan(500);
});

test("add refuses a Piece that does not exist", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const bulletinId = await asDirector.mutation(api.bulletins.createDraft, { title: "Notes" });
  const pieceId = await insertPiece(t, "Deleted soon");
  await t.run(async (ctx) => await ctx.db.delete("pieces", pieceId));

  await expect(
    asDirector.mutation(api.bulletinRemarks.add, { bulletinId, pieceId, text: "Gone" }),
  ).rejects.toThrow(/Piece not found/);
});
