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

// --- Bulletin Share Links (#83, ADR-0004) ----------------------------------
// The app's only unauthenticated read of Member-only content, so these run
// anonymously like everything above and assert both halves: that a token
// opens exactly the one Bulletin it was issued for, and that nothing else
// comes back with it.

const PUBLISHED_AT = 1_700_000_000_000;

async function insertMember(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: "https://example.clerk.accounts.dev|director_1",
      name: "Dana Director",
      email: "dana@example.com",
      role: "director",
    }),
  );
}

async function insertBulletin(
  t: ReturnType<typeof convexTest>,
  fields: {
    title?: string;
    body?: string;
    status?: "draft" | "published";
    eventId?: Id<"events">;
    shareLink?: { token: string; mode: "token" | "sign_in_required" };
  } = {},
) {
  const createdByMemberId = await insertMember(t);
  const status = fields.status ?? "published";
  return await t.run(async (ctx) =>
    ctx.db.insert("bulletins", {
      title: fields.title ?? "This week's notes",
      body: fields.body ?? "Warm-ups at 6:45.",
      eventId: fields.eventId,
      status,
      publishedAt: status === "published" ? PUBLISHED_AT : undefined,
      updatedAt: PUBLISHED_AT,
      createdByMemberId,
      updatedByMemberId: undefined,
      shareLink: fields.shareLink,
    }),
  );
}

const tokenLink = (token: string) => ({ token, mode: "token" as const });

test("getSharedBulletin resolves a token-mode published Bulletin, anonymously", async () => {
  const t = convexTest(schema, modules);
  await insertBulletin(t, { title: "Rehearsal notes", body: "# Bar 48", shareLink: tokenLink("tok_1") });

  const bulletin = await t.query(api.public.getSharedBulletin, { token: "tok_1" });

  expect(bulletin).toMatchObject({
    title: "Rehearsal notes",
    body: "# Bar 48",
    publishedAt: PUBLISHED_AT,
    event: null,
    remarks: [],
  });
});

test("getSharedBulletin resolves exactly the Bulletin its token was issued for", async () => {
  const t = convexTest(schema, modules);
  await insertBulletin(t, { title: "Wanted", shareLink: tokenLink("tok_wanted") });
  await insertBulletin(t, { title: "Other Bulletin", shareLink: tokenLink("tok_other") });

  const bulletin = await t.query(api.public.getSharedBulletin, { token: "tok_wanted" });

  expect(bulletin?.title).toBe("Wanted");
  expect(JSON.stringify(bulletin)).not.toContain("Other Bulletin");
});

test("getSharedBulletin returns the anchored Event's displayable metadata only", async () => {
  const t = convexTest(schema, modules);
  const eventId = await insertEvent(t, {
    title: "Thursday Rehearsal",
    startsAt: DAY,
    visibility: "private",
    location: "St Mary's Hall",
  });
  await insertBulletin(t, { eventId, shareLink: tokenLink("tok_event") });

  const bulletin = await t.query(api.public.getSharedBulletin, { token: "tok_event" });

  // A private Event is still named here — the Share Link's holder was given
  // this Bulletin, and the Bulletin is about that rehearsal. What must not
  // travel is anything beyond title/date/location.
  expect(bulletin?.event).toEqual({
    title: "Thursday Rehearsal",
    startsAt: DAY,
    location: "St Mary's Hall",
  });
  expect(Object.keys(bulletin!.event!).sort()).toEqual(["location", "startsAt", "title"]);
});

test("getSharedBulletin returns Remarks with their Piece titles in display order", async () => {
  const t = convexTest(schema, modules);
  const bulletinId = await insertBulletin(t, { shareLink: tokenLink("tok_remarks") });
  const [first, second] = await Promise.all([
    t.run(async (ctx) => ctx.db.insert("pieces", { title: "Sicut Cervus", files: [] })),
    t.run(async (ctx) => ctx.db.insert("pieces", { title: "The Blue Bird", files: [] })),
  ]);
  await t.run(async (ctx) => {
    await ctx.db.insert("bulletinRemarks", {
      bulletinId,
      pieceId: second,
      text: "Watch the cutoff at bar 48",
      displayOrder: 1,
    });
    await ctx.db.insert("bulletinRemarks", {
      bulletinId,
      pieceId: first,
      text: "Tenors, breathe at bar 12",
      displayOrder: 0,
    });
  });

  const bulletin = await t.query(api.public.getSharedBulletin, { token: "tok_remarks" });

  expect(bulletin?.remarks).toEqual([
    { pieceTitle: "Sicut Cervus", text: "Tenors, breathe at bar 12" },
    { pieceTitle: "The Blue Bird", text: "Watch the cutoff at bar 48" },
  ]);
});

test("getSharedBulletin returns nothing for a draft's token", async () => {
  const t = convexTest(schema, modules);
  await insertBulletin(t, {
    title: "Unpublished draft",
    status: "draft",
    shareLink: tokenLink("tok_draft"),
  });

  const bulletin = await t.query(api.public.getSharedBulletin, { token: "tok_draft" });

  expect(bulletin).toBeNull();
});

test("getSharedBulletin returns nothing for a sign-in-required link", async () => {
  const t = convexTest(schema, modules);
  await insertBulletin(t, {
    title: "Members only",
    shareLink: { token: "tok_signin", mode: "sign_in_required" },
  });

  const bulletin = await t.query(api.public.getSharedBulletin, { token: "tok_signin" });

  expect(bulletin).toBeNull();
});

test("getSharedBulletin returns nothing for an unknown token", async () => {
  const t = convexTest(schema, modules);
  await insertBulletin(t, { shareLink: tokenLink("tok_real") });

  expect(await t.query(api.public.getSharedBulletin, { token: "tok_nonexistent" })).toBeNull();
});

// A Bulletin with no Share Link at all indexes under `undefined` in
// by_share_link_token. If an empty string ever collapsed to undefined on the
// way to the index, it would match that Bulletin — so pin it.
test("getSharedBulletin returns nothing for an empty token", async () => {
  const t = convexTest(schema, modules);
  await insertBulletin(t, { title: "Never shared" });

  expect(await t.query(api.public.getSharedBulletin, { token: "" })).toBeNull();
});

test("regenerating a Share Link stops the old token resolving", async () => {
  const t = convexTest(schema, modules);
  const bulletinId = await insertBulletin(t, { shareLink: tokenLink("tok_old") });
  expect(await t.query(api.public.getSharedBulletin, { token: "tok_old" })).not.toBeNull();

  await t.run(async (ctx) => ctx.db.patch(bulletinId, { shareLink: tokenLink("tok_new") }));

  expect(await t.query(api.public.getSharedBulletin, { token: "tok_old" })).toBeNull();
  expect(await t.query(api.public.getSharedBulletin, { token: "tok_new" })).not.toBeNull();
});

test("revoking a Share Link stops its token resolving", async () => {
  const t = convexTest(schema, modules);
  const bulletinId = await insertBulletin(t, { shareLink: tokenLink("tok_revoked") });

  await t.run(async (ctx) => ctx.db.patch(bulletinId, { shareLink: undefined }));

  expect(await t.query(api.public.getSharedBulletin, { token: "tok_revoked" })).toBeNull();
});

// The boundary assertion this whole module exists for: the response carries
// these keys and no others, so no roster or RSVP field can ride along.
test("getSharedBulletin exposes no member or RSVP data", async () => {
  const t = convexTest(schema, modules);
  const eventId = await insertEvent(t, { title: "Rehearsal", startsAt: DAY, visibility: "private" });
  const bulletinId = await insertBulletin(t, { eventId, shareLink: tokenLink("tok_keys") });
  const memberId = await insertMember(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("rsvps", { eventId, memberId, status: "yes" });
  });

  const bulletin = await t.query(api.public.getSharedBulletin, { token: "tok_keys" });

  expect(Object.keys(bulletin!).sort()).toEqual([
    "body",
    "event",
    "publishedAt",
    "remarks",
    "title",
    "updatedAt",
  ]);
  const serialized = JSON.stringify(bulletin);
  expect(serialized).not.toContain("rsvp");
  expect(serialized).not.toContain("dana@example.com");
  expect(serialized).not.toContain(memberId);
  expect(serialized).not.toContain(bulletinId);
});

test("getSharedBulletinMode reports the mode of a published Bulletin's link", async () => {
  const t = convexTest(schema, modules);
  await insertBulletin(t, { shareLink: tokenLink("tok_mode") });
  await insertBulletin(t, { shareLink: { token: "tok_mode_signin", mode: "sign_in_required" } });

  expect(await t.query(api.public.getSharedBulletinMode, { token: "tok_mode" })).toBe("token");
  expect(await t.query(api.public.getSharedBulletinMode, { token: "tok_mode_signin" })).toBe(
    "sign_in_required",
  );
});

test("getSharedBulletinMode returns null for an unknown token or a draft", async () => {
  const t = convexTest(schema, modules);
  await insertBulletin(t, { status: "draft", shareLink: tokenLink("tok_draft_mode") });

  expect(await t.query(api.public.getSharedBulletinMode, { token: "tok_draft_mode" })).toBeNull();
  expect(await t.query(api.public.getSharedBulletinMode, { token: "nope" })).toBeNull();
});

// Structural guard on top of the behavioural ones above. public.ts's whole
// safety argument is "this module never reads those tables", which behaviour
// tests can only sample; this reads the source and checks the claim directly,
// so a future function added here that queries the roster fails immediately
// rather than whenever someone thinks to write a test for it.
test("public.ts reads neither the members nor the rsvps table", () => {
  const source = Object.values(
    import.meta.glob<string>("./public.ts", { query: "?raw", import: "default", eager: true }),
  )[0];
  // Comments in that module name both tables while explaining why it never
  // reads them; only the code is under test.
  const code = source.replace(/\/\/.*$/gm, "");

  // Proves the source actually loaded: without this, an empty read would
  // satisfy both "not" assertions below and the guard would pass vacuously.
  expect(code).toContain('.query("bulletins")');
  expect(code).not.toMatch(/["']members["']/);
  expect(code).not.toMatch(/["']rsvps["']/);
});
