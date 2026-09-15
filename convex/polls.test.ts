/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

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
const MARCH_1 = new Date(2026, 2, 1).getTime();

async function closePoll(t: ReturnType<typeof convexTest>, pollId: Id<"polls">) {
  // Closing is #87's mutation; here it is only setup for the read-only rule.
  await t.run(async (ctx) => ctx.db.patch("polls", pollId, { status: "closed" }));
}

test("create refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.polls.create, {
      title: "Not allowed",
      candidateDates: [{ startsAt: MARCH_1 }],
    }),
  ).rejects.toThrow(/Requires capability: managePolls/);
});

test("create opens the Poll and records its author", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);

  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Spring Concert",
    description: "Which Saturday works?",
    location: "St Mary's",
    candidateDates: [{ startsAt: MARCH_1 }],
  });

  const poll = await t.run(async (ctx) => ctx.db.get("polls", pollId));
  expect(poll).toMatchObject({
    title: "Spring Concert",
    description: "Which Saturday works?",
    location: "St Mary's",
    status: "open",
    createdByMemberId: directorId,
  });
});

test("create leaves the deadline unset when none is given", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);

  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "No deadline",
    candidateDates: [{ startsAt: MARCH_1 }],
  });

  const poll = await t.run(async (ctx) => ctx.db.get("polls", pollId));
  expect(poll?.deadlineAt).toBeUndefined();
});

test("create stores a deadline when one is given", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);

  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "With deadline",
    deadlineAt: MARCH_1 - 7 * DAY,
    candidateDates: [{ startsAt: MARCH_1 }],
  });

  const poll = await t.run(async (ctx) => ctx.db.get("polls", pollId));
  expect(poll?.deadlineAt).toBe(MARCH_1 - 7 * DAY);
});

test("get returns Candidate Dates in displayOrder, not insertion order", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);

  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Three options",
    candidateDates: [
      { startsAt: MARCH_1 + 2 * DAY },
      { startsAt: MARCH_1 },
      { startsAt: MARCH_1 + 1 * DAY },
    ],
  });

  const poll = await asDirector.query(api.polls.get, { pollId });
  expect(poll?.candidateDates.map((c) => c.startsAt)).toEqual([
    MARCH_1 + 2 * DAY,
    MARCH_1,
    MARCH_1 + 1 * DAY,
  ]);
  expect(poll?.candidateDates.map((c) => c.displayOrder)).toEqual([0, 1, 2]);
});

test("get is visible to every signed-in Member, not just a manager", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);

  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Open to all",
    candidateDates: [{ startsAt: MARCH_1 }],
  });

  const poll = await t.withIdentity(choristerIdentity).query(api.polls.get, { pollId });
  expect(poll?.title).toBe("Open to all");
});

test("list returns open Polls before closed ones, and refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);

  const closed = await asDirector.mutation(api.polls.create, {
    title: "Last year's concert",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  await closePoll(t, closed);
  const open = await asDirector.mutation(api.polls.create, {
    title: "This year's concert",
    candidateDates: [{ startsAt: MARCH_1 }],
  });

  expect((await asDirector.query(api.polls.list, {})).map((p) => p._id)).toEqual([open, closed]);
  await expect(t.withIdentity(choristerIdentity).query(api.polls.list, {})).rejects.toThrow(
    /Requires capability: managePolls/,
  );
});

test("addCandidateDate appends after the highest displayOrder", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Growing",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }],
  });

  await asDirector.mutation(api.polls.addCandidateDate, { pollId, startsAt: MARCH_1 + 2 * DAY });

  const poll = await asDirector.query(api.polls.get, { pollId });
  expect(poll?.candidateDates.map((c) => c.displayOrder)).toEqual([0, 1, 2]);
  expect(poll?.candidateDates.at(-1)?.startsAt).toBe(MARCH_1 + 2 * DAY);
});

test("a Candidate Date's end must be after its start", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);

  await expect(
    asDirector.mutation(api.polls.create, {
      title: "Backwards window",
      candidateDates: [{ startsAt: MARCH_1, endsAt: MARCH_1 - 1 }],
    }),
  ).rejects.toThrow(/end must be after its start/);

  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Fine",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  await expect(
    asDirector.mutation(api.polls.addCandidateDate, { pollId, startsAt: MARCH_1, endsAt: MARCH_1 }),
  ).rejects.toThrow(/end must be after its start/);
});

test("reorderCandidateDates renumbers to the order it is given", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Reorder me",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }, { startsAt: MARCH_1 + 2 * DAY }],
  });
  const before = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;

  await asDirector.mutation(api.polls.reorderCandidateDates, {
    pollId,
    candidateDateIds: [before[2]._id, before[0]._id, before[1]._id],
  });

  const after = await asDirector.query(api.polls.get, { pollId });
  expect(after?.candidateDates.map((c) => c._id)).toEqual([before[2]._id, before[0]._id, before[1]._id]);
});

test("reorderCandidateDates rejects a list that is not the Poll's dates exactly once", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Reorder me",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }],
  });
  const dates = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;

  await expect(
    asDirector.mutation(api.polls.reorderCandidateDates, {
      pollId,
      candidateDateIds: [dates[0]._id, dates[0]._id],
    }),
  ).rejects.toThrow(/every Candidate Date on the Poll exactly once/);
});

test("removeCandidateDate also deletes that date's Availabilities", async () => {
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Two options",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }],
  });
  const dates = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;
  // Responding is #85's mutation; the rows are seeded directly so the
  // cascade can be asserted without it.
  await t.run(async (ctx) => {
    await ctx.db.insert("availabilities", {
      candidateDateId: dates[0]._id,
      memberId: choristerId,
      value: "available",
    });
    await ctx.db.insert("availabilities", {
      candidateDateId: dates[1]._id,
      memberId: choristerId,
      value: "if_needed",
    });
  });

  await asDirector.mutation(api.polls.removeCandidateDate, { candidateDateId: dates[0]._id });

  const remaining = await t.run(async (ctx) => ctx.db.query("availabilities").collect());
  expect(remaining.map((a) => a.candidateDateId)).toEqual([dates[1]._id]);
});

test("update patches only the given fields and stamps the editor", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Spring Concert",
    location: "St Mary's",
    candidateDates: [{ startsAt: MARCH_1 }],
  });

  await asDirector.mutation(api.polls.update, { pollId, title: "Spring Concert 2026" });

  const poll = await t.run(async (ctx) => ctx.db.get("polls", pollId));
  expect(poll).toMatchObject({
    title: "Spring Concert 2026",
    location: "St Mary's",
    updatedByMemberId: directorId,
  });
});

test("update clears the deadline when given null, and the location when given an empty string", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Spring Concert",
    location: "St Mary's",
    deadlineAt: MARCH_1 - 7 * DAY,
    candidateDates: [{ startsAt: MARCH_1 }],
  });

  await asDirector.mutation(api.polls.update, { pollId, deadlineAt: null, location: "" });

  const poll = await t.run(async (ctx) => ctx.db.get("polls", pollId));
  expect(poll?.deadlineAt).toBeUndefined();
  expect(poll?.location).toBeUndefined();
});

test("update refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }],
  });

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.polls.update, { pollId, title: "Hijacked" }),
  ).rejects.toThrow(/Requires capability: managePolls/);
});

test("every mutation on a closed Poll throws", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Settled",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  const dates = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;
  await closePoll(t, pollId);

  const readOnly = /closed Poll is read-only/;
  await expect(asDirector.mutation(api.polls.update, { pollId, title: "Reopened" })).rejects.toThrow(readOnly);
  await expect(
    asDirector.mutation(api.polls.addCandidateDate, { pollId, startsAt: MARCH_1 + DAY }),
  ).rejects.toThrow(readOnly);
  await expect(
    asDirector.mutation(api.polls.reorderCandidateDates, { pollId, candidateDateIds: [dates[0]._id] }),
  ).rejects.toThrow(readOnly);
  await expect(
    asDirector.mutation(api.polls.removeCandidateDate, { candidateDateId: dates[0]._id }),
  ).rejects.toThrow(readOnly);
});

test("a Chorister may record an Availability on an open Poll", async () => {
  const t = convexTest(schema, modules);
  const { choristerId } = await seedMembers(t);
  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  const dates = (await t.withIdentity(directorIdentity).query(api.polls.get, { pollId }))!.candidateDates;

  await t
    .withIdentity(choristerIdentity)
    .mutation(api.polls.setAvailability, { candidateDateId: dates[0]._id, value: "if_needed" });

  const stored = await t.run(async (ctx) => ctx.db.query("availabilities").collect());
  expect(stored).toMatchObject([{ memberId: choristerId, value: "if_needed" }]);
});

test("changing an answer patches the one row instead of adding a second", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asChorister = t.withIdentity(choristerIdentity);
  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  const dates = (await asChorister.query(api.polls.get, { pollId }))!.candidateDates;

  await asChorister.mutation(api.polls.setAvailability, { candidateDateId: dates[0]._id, value: "available" });
  await asChorister.mutation(api.polls.setAvailability, { candidateDateId: dates[0]._id, value: "unavailable" });

  const stored = await t.run(async (ctx) => ctx.db.query("availabilities").collect());
  expect(stored).toHaveLength(1);
  expect(stored[0].value).toBe("unavailable");
});

test("setAvailability refuses a closed Poll", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Settled",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  const dates = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;
  await closePoll(t, pollId);

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.polls.setAvailability, {
      candidateDateId: dates[0]._id,
      value: "available",
    }),
  ).rejects.toThrow(/closed Poll is read-only/);
});

test("grid names every Member, including the ones who have not answered", async () => {
  const t = convexTest(schema, modules);
  const { directorId, choristerId } = await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Two options",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }],
  });
  const dates = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;

  await t
    .withIdentity(choristerIdentity)
    .mutation(api.polls.setAvailability, { candidateDateId: dates[0]._id, value: "available" });

  const grid = await t.withIdentity(choristerIdentity).query(api.polls.getGrid, { pollId });
  expect(grid?.rows).toEqual([
    { memberId: choristerId, name: "Chris Chorister", isViewer: true, values: ["available", null] },
    { memberId: directorId, name: "Dana Director", isViewer: false, values: [null, null] },
  ]);
});

test("grid tallies each value separately and counts who is still missing", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Two options",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }],
  });
  const dates = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;

  await asDirector.mutation(api.polls.setAvailability, { candidateDateId: dates[0]._id, value: "available" });
  await t
    .withIdentity(choristerIdentity)
    .mutation(api.polls.setAvailability, { candidateDateId: dates[0]._id, value: "if_needed" });
  await t
    .withIdentity(choristerIdentity)
    .mutation(api.polls.setAvailability, { candidateDateId: dates[1]._id, value: "unavailable" });

  const grid = await asDirector.query(api.polls.getGrid, { pollId });
  expect(grid?.tallies).toEqual([
    { available: 1, unavailable: 0, if_needed: 1, notAnswered: 0 },
    { available: 0, unavailable: 1, if_needed: 0, notAnswered: 1 },
  ]);
});

test("grid keeps its columns in the Poll's displayOrder", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Three options",
    candidateDates: [{ startsAt: MARCH_1 + 2 * DAY }, { startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }],
  });

  const grid = await asDirector.query(api.polls.getGrid, { pollId });
  expect(grid?.candidateDates.map((c) => c.startsAt)).toEqual([MARCH_1 + 2 * DAY, MARCH_1, MARCH_1 + DAY]);
});

test("a Poll's grid is closed to a caller with no identity", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Named personal data",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  const dates = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;

  // A Poll's grid names identifiable Members, so it is never reachable
  // without signing in (#9) — there is no token-shared or public twin.
  await expect(t.query(api.polls.getGrid, { pollId })).rejects.toThrow(/Not signed in/);
  await expect(t.query(api.polls.listForMember, {})).rejects.toThrow(/Not signed in/);
  await expect(
    t.mutation(api.polls.setAvailability, { candidateDateId: dates[0]._id, value: "available" }),
  ).rejects.toThrow(/Not signed in/);
});

test("setAvailability leaves the Poll's own audit stamp alone", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  const dates = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;
  const before = (await t.run(async (ctx) => ctx.db.get("polls", pollId)))!;

  await t
    .withIdentity(choristerIdentity)
    .mutation(api.polls.setAvailability, { candidateDateId: dates[0]._id, value: "available" });

  // Answering a Poll is not editing it: updatedByMemberId belongs to the
  // Director who owns the Poll's contents (#84), and a response must not
  // overwrite it. #86 and #87 add mutations either side of this one.
  const after = (await t.run(async (ctx) => ctx.db.get("polls", pollId)))!;
  expect(after.updatedAt).toBe(before.updatedAt);
  expect(after.updatedByMemberId).toBe(before.updatedByMemberId);
});

// Closing a Poll and promoting its winner into an Event (#87). The ADR this
// implements exists to protect one thing above all: an Availability is a
// hypothetical about an unchosen date, so promotion must never write an
// `rsvps` row.
describe("closing a Poll", () => {
  async function pollWithTwoDates(t: ReturnType<typeof convexTest>, title = "Spring Concert") {
    const asDirector = t.withIdentity(directorIdentity);
    const pollId = await asDirector.mutation(api.polls.create, {
      title,
      description: "Which Saturday works?",
      location: "St Mary's",
      candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + 7 * DAY }],
    });
    const candidateDates = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;
    return { pollId, candidateDates };
  }

  test("promotion creates an Event from the Poll's draft metadata and the winning date", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId, candidateDates } = await pollWithTwoDates(t);

    const eventId = await t.withIdentity(directorIdentity).mutation(api.polls.close, {
      pollId,
      winningCandidateDateId: candidateDates[1]._id,
    });

    const event = await t.run(async (ctx) => ctx.db.get("events", eventId!));
    expect(event).toMatchObject({
      title: "Spring Concert",
      description: "Which Saturday works?",
      location: "St Mary's",
      startsAt: MARCH_1 + 7 * DAY,
      setlist: [],
      visibility: "private",
    });
  });

  test("the Poll records the date that won and the Event it produced", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId, candidateDates } = await pollWithTwoDates(t);

    const eventId = await t.withIdentity(directorIdentity).mutation(api.polls.close, {
      pollId,
      winningCandidateDateId: candidateDates[0]._id,
    });

    const poll = await t.run(async (ctx) => ctx.db.get("polls", pollId));
    expect(poll).toMatchObject({
      status: "closed",
      winningCandidateDateId: candidateDates[0]._id,
      resultingEventId: eventId,
    });
  });

  test("promotion writes no RSVP, whatever Availability the Poll collected", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId, candidateDates } = await pollWithTwoDates(t);
    await t
      .withIdentity(choristerIdentity)
      .mutation(api.polls.setAvailability, { candidateDateId: candidateDates[0]._id, value: "available" });
    await t
      .withIdentity(directorIdentity)
      .mutation(api.polls.setAvailability, { candidateDateId: candidateDates[0]._id, value: "if_needed" });

    await t
      .withIdentity(directorIdentity)
      .mutation(api.polls.close, { pollId, winningCandidateDateId: candidateDates[0]._id });

    // The decision ADR-0005 exists to protect: an Availability is never
    // converted into a commitment to the Event that was just created.
    const rsvps = await t.run(async (ctx) => ctx.db.query("rsvps").collect());
    expect(rsvps).toHaveLength(0);
  });

  test("closing with no winner creates no Event", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId } = await pollWithTwoDates(t);

    await t.withIdentity(directorIdentity).mutation(api.polls.close, { pollId });

    const events = await t.run(async (ctx) => ctx.db.query("events").collect());
    expect(events).toHaveLength(0);
  });

  test("closing with no winner closes the Poll and records no winner", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId } = await pollWithTwoDates(t);

    await t.withIdentity(directorIdentity).mutation(api.polls.close, { pollId });

    const poll = await t.run(async (ctx) => ctx.db.get("polls", pollId));
    // Picked rather than toMatchObject: an absent optional field is a
    // missing key, which toMatchObject reads as a mismatch against
    // `undefined` rather than as the "no winner" this asserts.
    expect({
      status: poll?.status,
      winningCandidateDateId: poll?.winningCandidateDateId,
      resultingEventId: poll?.resultingEventId,
    }).toEqual({ status: "closed", winningCandidateDateId: undefined, resultingEventId: undefined });
  });

  test("closing stamps the Poll with the Director who closed it", async () => {
    const t = convexTest(schema, modules);
    const { directorId } = await seedMembers(t);
    const { pollId } = await pollWithTwoDates(t);

    await t.withIdentity(directorIdentity).mutation(api.polls.close, { pollId });

    const poll = await t.run(async (ctx) => ctx.db.get("polls", pollId));
    expect(poll?.updatedByMemberId).toBe(directorId);
  });

  test("a closed Poll refuses to be closed again — there is no reopen", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId, candidateDates } = await pollWithTwoDates(t);
    await t.withIdentity(directorIdentity).mutation(api.polls.close, { pollId });

    await expect(
      t
        .withIdentity(directorIdentity)
        .mutation(api.polls.close, { pollId, winningCandidateDateId: candidateDates[0]._id }),
    ).rejects.toThrow(/closed Poll is read-only/);
  });

  test("a closed Poll refuses an edit to its metadata", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId } = await pollWithTwoDates(t);
    await t.withIdentity(directorIdentity).mutation(api.polls.close, { pollId });

    await expect(
      t.withIdentity(directorIdentity).mutation(api.polls.update, { pollId, title: "Renamed" }),
    ).rejects.toThrow(/closed Poll is read-only/);
  });

  test("a Chorister cannot close a Poll", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId, candidateDates } = await pollWithTwoDates(t);

    await expect(
      t
        .withIdentity(choristerIdentity)
        .mutation(api.polls.close, { pollId, winningCandidateDateId: candidateDates[0]._id }),
    ).rejects.toThrow(/Requires capability: managePolls/);
  });

  test("a winning date from another Poll is refused", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId } = await pollWithTwoDates(t);
    const other = await pollWithTwoDates(t, "A different Poll");

    await expect(
      t
        .withIdentity(directorIdentity)
        .mutation(api.polls.close, { pollId, winningCandidateDateId: other.candidateDates[0]._id }),
    ).rejects.toThrow(/does not belong to this Poll/);
  });

  test("a refused promotion leaves no Event behind", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId } = await pollWithTwoDates(t);
    const other = await pollWithTwoDates(t, "A different Poll");

    await expect(
      t
        .withIdentity(directorIdentity)
        .mutation(api.polls.close, { pollId, winningCandidateDateId: other.candidateDates[0]._id }),
    ).rejects.toThrow();

    const events = await t.run(async (ctx) => ctx.db.query("events").collect());
    expect(events).toHaveLength(0);
  });

  test("getForEvent finds the Poll behind the Event it produced", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId, candidateDates } = await pollWithTwoDates(t);
    const eventId = await t
      .withIdentity(directorIdentity)
      .mutation(api.polls.close, { pollId, winningCandidateDateId: candidateDates[0]._id });

    const grid = await t.withIdentity(choristerIdentity).query(api.polls.getForEvent, { eventId: eventId! });
    expect(grid?.poll._id).toBe(pollId);
  });

  test("getForEvent carries the Poll's grid so the Event can show it", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId, candidateDates } = await pollWithTwoDates(t);
    await t
      .withIdentity(choristerIdentity)
      .mutation(api.polls.setAvailability, { candidateDateId: candidateDates[0]._id, value: "available" });
    const eventId = await t
      .withIdentity(directorIdentity)
      .mutation(api.polls.close, { pollId, winningCandidateDateId: candidateDates[0]._id });

    const grid = await t.withIdentity(directorIdentity).query(api.polls.getForEvent, { eventId: eventId! });
    expect(grid?.tallies[0]).toEqual({ available: 1, unavailable: 0, if_needed: 0, notAnswered: 1 });
  });

  test("getForEvent is null for an Event no Poll produced", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const eventId = await t.withIdentity(directorIdentity).mutation(api.events.createDraft, { title: "Rehearsal" });

    const grid = await t.withIdentity(directorIdentity).query(api.polls.getForEvent, { eventId });
    expect(grid).toBeNull();
  });

  test("getForEvent is closed to a caller with no identity", async () => {
    const t = convexTest(schema, modules);
    await seedMembers(t);
    const { pollId, candidateDates } = await pollWithTwoDates(t);
    const eventId = await t
      .withIdentity(directorIdentity)
      .mutation(api.polls.close, { pollId, winningCandidateDateId: candidateDates[0]._id });

    await expect(t.query(api.polls.getForEvent, { eventId: eventId! })).rejects.toThrow(/Not signed in/);
  });
});
