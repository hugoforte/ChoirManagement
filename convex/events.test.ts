/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

const directorIdentity = { subject: "director_1", issuer: "https://example.clerk.accounts.dev" };
const choristerIdentity = { subject: "chorister_1", issuer: "https://example.clerk.accounts.dev" };

async function seedMembers(t: ReturnType<typeof convexTest>) {
  const [directorId, choristerId] = await Promise.all([
    t.run(async (ctx) =>
      ctx.db.insert("members", {
        clerkUserId: "https://example.clerk.accounts.dev|director_1",
        name: "Dana Director",
        email: "dana@example.com",
        role: "director",
      }),
    ),
    t.run(async (ctx) =>
      ctx.db.insert("members", {
        clerkUserId: "https://example.clerk.accounts.dev|chorister_1",
        name: "Chris Chorister",
        email: "chris@example.com",
        role: "chorister",
      }),
    ),
  ]);
  return { directorId, choristerId };
}

const DAY = 24 * 60 * 60 * 1000;

// Direct DB setup, not the mutation layer — since #33, events.create no
// longer exists (createDraft only takes a title), and every test here that
// needs a specific startsAt/visibility/Setlist for its own assertions is
// setup, not the behavior under test. Matches convex/public.test.ts's
// existing convention.
async function insertEvent(
  t: ReturnType<typeof convexTest>,
  fields: {
    title: string;
    startsAt: number;
    visibility?: "public" | "private";
    setlist?: Id<"pieces">[];
    description?: string;
    location?: string;
    youtubeUrl?: string;
  },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("events", {
      description: undefined,
      location: undefined,
      youtubeUrl: undefined,
      setlist: [],
      visibility: "private",
      ...fields,
    }),
  );
}

test("list returns upcoming Events ascending, then past Events descending", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const now = 1_000_000;

  const farFuture = await insertEvent(t, { title: "Far Future", startsAt: now + 10 * DAY });
  const nearFuture = await insertEvent(t, { title: "Near Future", startsAt: now + 1 * DAY });
  const recentPast = await insertEvent(t, { title: "Recent Past", startsAt: now - 1 * DAY });
  const distantPast = await insertEvent(t, { title: "Distant Past", startsAt: now - 10 * DAY });

  const list = await asDirector.query(api.events.list, { now });
  expect(list.map((e) => e._id)).toEqual([nearFuture, farFuture, recentPast, distantPast]);
});

test("createDraft creates a private, empty draft starting now", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const before = Date.now();

  const eventId = await t.withIdentity(directorIdentity).mutation(api.events.createDraft, { title: "New Idea" });

  const event = await t.run(async (ctx) => await ctx.db.get("events", eventId));
  expect(event).toMatchObject({ title: "New Idea", visibility: "private", setlist: [] });
  expect(event?.startsAt).toBeGreaterThanOrEqual(before);
});

test("createDraft refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  await expect(
    t.withIdentity(choristerIdentity).mutation(api.events.createDraft, { title: "Not allowed" }),
  ).rejects.toThrow(/Requires capability: manageEvents/);
});

test("get resolves the Setlist to piece titles and includes the caller's own RSVP", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const asChorister = t.withIdentity(choristerIdentity);

  const pieceId = await asDirector.mutation(api.pieces.create, { title: "Ubi Caritas" });
  const eventId = await insertEvent(t, { title: "Rehearsal", startsAt: 0, setlist: [pieceId] });

  const beforeRsvp = await asChorister.query(api.events.get, { eventId });
  expect(beforeRsvp?.setlist).toEqual([{ _id: pieceId, title: "Ubi Caritas" }]);
  expect(beforeRsvp?.myRsvp).toBeNull();

  await asChorister.mutation(api.events.rsvp, { eventId, status: "yes" });
  const afterRsvp = await asChorister.query(api.events.get, { eventId });
  expect(afterRsvp?.myRsvp).toBe("yes");
});

test("rsvp upserts — a second call updates, not duplicates", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asChorister = t.withIdentity(choristerIdentity);
  const eventId = await insertEvent(t, { title: "Rehearsal", startsAt: 0 });

  await asChorister.mutation(api.events.rsvp, { eventId, status: "maybe" });
  await asChorister.mutation(api.events.rsvp, { eventId, status: "yes" });

  const rsvps = await t.run(async (ctx) => await ctx.db.query("rsvps").collect());
  expect(rsvps).toHaveLength(1);
  expect(rsvps[0].status).toBe("yes");

  const mine = await asChorister.query(api.events.myRsvps, {});
  expect(mine).toEqual([{ eventId, status: "yes" }]);
});

test("roster refuses a Chorister but returns the full list for a Director", async () => {
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const asChorister = t.withIdentity(choristerIdentity);
  const eventId = await insertEvent(t, { title: "Rehearsal", startsAt: 0 });
  await asChorister.mutation(api.events.rsvp, { eventId, status: "no" });

  await expect(asChorister.query(api.events.roster, { eventId })).rejects.toThrow(/Requires capability: manageEvents/);

  const roster = await asDirector.query(api.events.roster, { eventId });
  expect(roster).toEqual([{ memberId: choristerId, name: "Chris Chorister", status: "no" }]);
});

test("remove deletes the Event and its RSVPs", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const asChorister = t.withIdentity(choristerIdentity);
  const eventId = await insertEvent(t, { title: "Rehearsal", startsAt: 0 });
  await asChorister.mutation(api.events.rsvp, { eventId, status: "yes" });

  await asDirector.mutation(api.events.remove, { eventId });

  const event = await t.run(async (ctx) => await ctx.db.get("events", eventId));
  expect(event).toBeNull();
  const rsvps = await t.run(async (ctx) => await ctx.db.query("rsvps").collect());
  expect(rsvps).toHaveLength(0);
});

test("update patches only the given fields, leaving the rest untouched", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const eventId = await insertEvent(t, {
    title: "Rehearsal",
    startsAt: 0,
    location: "Choir Room",
    visibility: "private",
  });

  await asDirector.mutation(api.events.update, { eventId, visibility: "public" });

  const event = await t.run(async (ctx) => await ctx.db.get("events", eventId));
  expect(event).toMatchObject({ title: "Rehearsal", location: "Choir Room", visibility: "public" });
});

test("update normalizes an empty string to undefined, actually clearing the field", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const eventId = await insertEvent(t, { title: "Rehearsal", startsAt: 0, location: "Choir Room" });

  await asDirector.mutation(api.events.update, { eventId, location: "" });

  const event = await t.run(async (ctx) => await ctx.db.get("events", eventId));
  expect(event?.location).toBeUndefined();
});

test("update refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const eventId = await insertEvent(t, { title: "Rehearsal", startsAt: 0 });

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.events.update, { eventId, title: "Hijacked" }),
  ).rejects.toThrow(/Requires capability: manageEvents/);
});

test("remove refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const eventId = await insertEvent(t, { title: "Rehearsal", startsAt: 0 });

  await expect(t.withIdentity(choristerIdentity).mutation(api.events.remove, { eventId })).rejects.toThrow(
    /Requires capability: manageEvents/,
  );
});

test("duplicate refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const eventId = await insertEvent(t, { title: "Rehearsal", startsAt: 0 });

  await expect(t.withIdentity(choristerIdentity).mutation(api.events.duplicate, { eventId })).rejects.toThrow(
    /Requires capability: manageEvents/,
  );
});

test("duplicate copies fields and Setlist but shifts startsAt by a week", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pieceId = await asDirector.mutation(api.pieces.create, { title: "Ave Verum Corpus" });
  const eventId = await insertEvent(t, {
    title: "This Week",
    startsAt: 1_000_000,
    setlist: [pieceId],
    visibility: "public",
  });

  const dupId = await asDirector.mutation(api.events.duplicate, { eventId });

  const dup = await t.run(async (ctx) => await ctx.db.get("events", dupId));
  expect(dup).toMatchObject({
    title: "This Week",
    startsAt: 1_000_000 + 7 * DAY,
    setlist: [pieceId],
    visibility: "public",
  });
});
