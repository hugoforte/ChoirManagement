/// <reference types="vite/client" />
// Editing an open Poll *after responses exist* (#86). The destructive-edit
// semantics get their own file rather than riding along in polls.test.ts:
// what matters here is what happens to Availabilities already recorded, so
// every test seeds real answers first and then asserts on the rows that
// survive.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

const directorIdentity = { subject: "director_1", issuer: "https://example.clerk.accounts.dev" };
const choristerIdentity = { subject: "chorister_1", issuer: "https://example.clerk.accounts.dev" };

const DAY = 24 * 60 * 60 * 1000;
const MARCH_1 = new Date(2026, 2, 1).getTime();

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

// A Poll with two Candidate Dates and both Members answered on both — the
// starting point every test here edits from.
async function seedAnsweredPoll(t: ReturnType<typeof convexTest>) {
  const { directorId, choristerId } = await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + 7 * DAY }],
  });
  const dates = (await asDirector.query(api.polls.get, { pollId }))!.candidateDates;

  await t.run(async (ctx) => {
    await ctx.db.insert("availabilities", {
      candidateDateId: dates[0]._id,
      memberId: choristerId,
      value: "available",
    });
    await ctx.db.insert("availabilities", {
      candidateDateId: dates[0]._id,
      memberId: directorId,
      value: "if_needed",
    });
    await ctx.db.insert("availabilities", {
      candidateDateId: dates[1]._id,
      memberId: choristerId,
      value: "unavailable",
    });
    await ctx.db.insert("availabilities", {
      candidateDateId: dates[1]._id,
      memberId: directorId,
      value: "available",
    });
  });

  return { pollId, dates, directorId, choristerId, asDirector };
}

function availabilitiesOf(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => ctx.db.query("availabilities").collect());
}

function answerFor(
  availabilities: Doc<"availabilities">[],
  candidateDateId: Id<"candidateDates">,
  memberId: Id<"members">,
) {
  return availabilities.find((a) => a.candidateDateId === candidateDateId && a.memberId === memberId)?.value;
}

describe("adding a Candidate Date to a Poll that already has responses", () => {
  test("leaves every prior answer untouched", async () => {
    const t = convexTest(schema, modules);
    const { pollId, dates, directorId, choristerId, asDirector } = await seedAnsweredPoll(t);
    const before = await availabilitiesOf(t);

    await asDirector.mutation(api.polls.addCandidateDate, { pollId, startsAt: MARCH_1 + 14 * DAY });

    const after = await availabilitiesOf(t);
    expect(after).toHaveLength(before.length);
    expect(answerFor(after, dates[0]._id, choristerId)).toBe("available");
    expect(answerFor(after, dates[0]._id, directorId)).toBe("if_needed");
    expect(answerFor(after, dates[1]._id, choristerId)).toBe("unavailable");
    expect(answerFor(after, dates[1]._id, directorId)).toBe("available");
  });

  test("leaves the new date unanswered by everyone", async () => {
    const t = convexTest(schema, modules);
    const { pollId, asDirector } = await seedAnsweredPoll(t);

    const addedId = await asDirector.mutation(api.polls.addCandidateDate, {
      pollId,
      startsAt: MARCH_1 + 14 * DAY,
    });

    const grid = (await asDirector.query(api.polls.getGrid, { pollId }))!;
    const column = grid.candidateDates.findIndex((c) => c._id === addedId);
    expect(grid.tallies[column]).toEqual({ available: 0, unavailable: 0, if_needed: 0, notAnswered: 2 });
  });
});

describe("removing a Candidate Date", () => {
  test("deletes exactly that date's Availabilities and no others", async () => {
    const t = convexTest(schema, modules);
    const { dates, directorId, choristerId, asDirector } = await seedAnsweredPoll(t);

    await asDirector.mutation(api.polls.removeCandidateDate, { candidateDateId: dates[0]._id });

    const after = await availabilitiesOf(t);
    expect(after).toHaveLength(2);
    expect(after.every((a) => a.candidateDateId === dates[1]._id)).toBe(true);
    expect(answerFor(after, dates[1]._id, choristerId)).toBe("unavailable");
    expect(answerFor(after, dates[1]._id, directorId)).toBe("available");
  });

  test("leaves the surviving Candidate Date's tally unchanged", async () => {
    const t = convexTest(schema, modules);
    const { pollId, dates, asDirector } = await seedAnsweredPoll(t);
    const before = (await asDirector.query(api.polls.getGrid, { pollId }))!.tallies[1];

    await asDirector.mutation(api.polls.removeCandidateDate, { candidateDateId: dates[0]._id });

    const grid = (await asDirector.query(api.polls.getGrid, { pollId }))!;
    expect(grid.candidateDates).toHaveLength(1);
    expect(grid.tallies[0]).toEqual(before);
  });
});

describe("a closed Poll", () => {
  // polls.test.ts covers that each mutation throws; what matters once
  // responses exist is that the refusal is total — a rejected removal must
  // not have cascaded through the Availabilities on its way out.
  test("refuses every Candidate Date mutation and destroys nothing", async () => {
    const t = convexTest(schema, modules);
    const { pollId, dates, asDirector } = await seedAnsweredPoll(t);
    // Closing is #87's mutation; here it is only setup for the read-only rule.
    await t.run(async (ctx) => ctx.db.patch("polls", pollId, { status: "closed" }));

    const readOnly = /closed Poll is read-only/;
    await expect(
      asDirector.mutation(api.polls.addCandidateDate, { pollId, startsAt: MARCH_1 + 14 * DAY }),
    ).rejects.toThrow(readOnly);
    await expect(
      asDirector.mutation(api.polls.removeCandidateDate, { candidateDateId: dates[0]._id }),
    ).rejects.toThrow(readOnly);
    await expect(
      asDirector.mutation(api.polls.reorderCandidateDates, {
        pollId,
        candidateDateIds: [dates[1]._id, dates[0]._id],
      }),
    ).rejects.toThrow(readOnly);

    expect(await availabilitiesOf(t)).toHaveLength(4);
    const grid = (await asDirector.query(api.polls.getGrid, { pollId }))!;
    expect(grid.candidateDates.map((c) => c._id)).toEqual([dates[0]._id, dates[1]._id]);
  });

  test("refuses a Chorister's answer too, leaving their earlier one standing", async () => {
    const t = convexTest(schema, modules);
    const { pollId, dates, choristerId } = await seedAnsweredPoll(t);
    await t.run(async (ctx) => ctx.db.patch("polls", pollId, { status: "closed" }));

    await expect(
      t
        .withIdentity(choristerIdentity)
        .mutation(api.polls.setAvailability, { candidateDateId: dates[0]._id, value: "unavailable" }),
    ).rejects.toThrow(/closed Poll is read-only/);

    expect(answerFor(await availabilitiesOf(t), dates[0]._id, choristerId)).toBe("available");
  });
});
