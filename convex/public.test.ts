/// <reference types="vite/client" />
// public.ts's own header states the invariant: "this module must never
// query rsvps or members, so a public caller can never receive RSVP or
// roster data by construction, not by a conditional that could be edited
// wrong later." These tests pin that invariant at its interface — every
// call here is anonymous (no t.withIdentity), matching a real unauthenticated
// visitor — rather than trusting the structural argument alone (see #30).
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

const DAY = 24 * 60 * 60 * 1000;
const baseEvent: { description?: string; location?: string; youtubeUrl?: string; setlist: Id<"pieces">[] } = {
  description: undefined,
  location: undefined,
  youtubeUrl: undefined,
  setlist: [],
};

async function insertEvent(
  t: ReturnType<typeof convexTest>,
  fields: Partial<typeof baseEvent> & { title: string; startsAt: number; visibility: "public" | "private" },
) {
  return await t.run(async (ctx) => ctx.db.insert("events", { ...baseEvent, ...fields }));
}

test("listEvents returns only public Events, anonymously", async () => {
  const t = convexTest(schema, modules);
  await insertEvent(t, { title: "Public Concert", startsAt: DAY, visibility: "public" });
  await insertEvent(t, { title: "Private Rehearsal", startsAt: DAY, visibility: "private" });

  const events = await t.query(api.public.listEvents, {});

  expect(events).toHaveLength(1);
  expect(events[0].title).toBe("Public Concert");
  // The private Event's title must not merely be filtered from the list —
  // it must never have been fetchable at all. Asserting its title is absent
  // from the serialized response, not just missing from this one field.
  expect(JSON.stringify(events)).not.toContain("Private Rehearsal");
});

test("listEvents resolves Setlist Piece titles", async () => {
  const t = convexTest(schema, modules);
  const pieceId = await t.run(async (ctx) => ctx.db.insert("pieces", { title: "Ave Maria", files: [] }));
  await insertEvent(t, { title: "Concert", startsAt: DAY, visibility: "public", setlist: [pieceId] });

  const events = await t.query(api.public.listEvents, {});

  expect(events[0].setlistTitles).toEqual(["Ave Maria"]);
});

test("listEvents is bounded at 50 even with more public Events", async () => {
  const t = convexTest(schema, modules);
  await Promise.all(
    Array.from({ length: 55 }, (_, i) =>
      insertEvent(t, { title: `Event ${i}`, startsAt: DAY + i, visibility: "public" }),
    ),
  );

  const events = await t.query(api.public.listEvents, {});

  expect(events).toHaveLength(50);
});

test("getEvent returns full data for a public Event, anonymously", async () => {
  const t = convexTest(schema, modules);
  const eventId = await insertEvent(t, {
    title: "Spring Concert",
    startsAt: DAY,
    visibility: "public",
    location: "Town Hall",
  });

  const event = await t.query(api.public.getEvent, { eventId });

  expect(event).toMatchObject({
    exists: true,
    visibility: "public",
    title: "Spring Concert",
    location: "Town Hall",
  });
});

test("getEvent on a private Event reveals only that it exists and is private", async () => {
  const t = convexTest(schema, modules);
  const eventId = await insertEvent(t, {
    title: "Members-only Rehearsal",
    startsAt: DAY,
    visibility: "private",
    location: "Secret Location",
  });

  const event = await t.query(api.public.getEvent, { eventId });

  expect(event).toEqual({ exists: true, visibility: "private" });
  // Belt and suspenders on top of the exact-equality check above: the
  // private title/location must not be reachable through this query at all.
  expect(JSON.stringify(event)).not.toContain("Rehearsal");
  expect(JSON.stringify(event)).not.toContain("Secret Location");
});

test("getEvent on a nonexistent id returns null", async () => {
  const t = convexTest(schema, modules);
  const eventId = await insertEvent(t, { title: "Temp", startsAt: DAY, visibility: "public" });
  await t.run(async (ctx) => ctx.db.delete(eventId));

  const event = await t.query(api.public.getEvent, { eventId });

  expect(event).toBeNull();
});
