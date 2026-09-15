/// <reference types="vite/client" />
// The Member-facing Poll list and its closed-Poll history (#88). Kept apart
// from polls.test.ts, which covers authoring and the responding grid — one
// test file per slice is what lets the Poll slices run as parallel
// workstreams (docs/architecture/bulletins-and-polls-orchestration.md).
//
// Closing is #87's mutation, so the closed Polls here are made by patching
// the schema fields it will set. That keeps this slice testable before
// closing exists in the UI, and the assertions are about the list's reading
// of those fields either way.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

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

async function candidateDateIds(t: ReturnType<typeof convexTest>, pollId: Id<"polls">) {
  const poll = await t.withIdentity(directorIdentity).query(api.polls.get, { pollId });
  if (!poll) throw new Error("Expected the Poll just created");
  return poll.candidateDates.map((date) => date._id);
}

test("open Polls come before closed ones, newest first within each", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);

  const oldClosed = await asDirector.mutation(api.polls.create, {
    title: "Last year's concert",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  const newClosed = await asDirector.mutation(api.polls.create, {
    title: "Last year's potluck",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  const oldOpen = await asDirector.mutation(api.polls.create, {
    title: "Extra rehearsal",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  const newOpen = await asDirector.mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  await t.run(async (ctx) => {
    await ctx.db.patch("polls", oldClosed, { status: "closed" });
    await ctx.db.patch("polls", newClosed, { status: "closed" });
  });

  const polls = await t.withIdentity(choristerIdentity).query(api.polls.listForMember, {});

  expect(polls.map((poll) => poll._id)).toEqual([newOpen, oldOpen, newClosed, oldClosed]);
});

test("a closed Poll carries the date that won and the Event it became", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);

  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY, endsAt: MARCH_1 + DAY + 2 * 60 * 60 * 1000 }],
  });
  const [, winner] = await candidateDateIds(t, pollId);
  const eventId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("events", {
      title: "Spring Concert",
      startsAt: MARCH_1 + DAY,
      setlist: [],
      visibility: "private",
    });
    await ctx.db.patch("polls", pollId, {
      status: "closed",
      winningCandidateDateId: winner,
      resultingEventId: id,
    });
    return id;
  });

  const polls = await t.withIdentity(choristerIdentity).query(api.polls.listForMember, {});

  expect(polls[0].outcome).toEqual({
    winningStartsAt: MARCH_1 + DAY,
    winningEndsAt: MARCH_1 + DAY + 2 * 60 * 60 * 1000,
    resultingEventId: eventId,
  });
});

test("a Poll closed with no winner carries an outcome with nothing in it", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);

  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "No date worked",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  await t.run(async (ctx) => ctx.db.patch("polls", pollId, { status: "closed" }));

  const polls = await t.withIdentity(choristerIdentity).query(api.polls.listForMember, {});

  expect(polls[0].outcome).toEqual({
    winningStartsAt: null,
    winningEndsAt: null,
    resultingEventId: null,
  });
});

test("an open Poll has no outcome", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Still running",
    candidateDates: [{ startsAt: MARCH_1 }],
  });

  const polls = await t.withIdentity(choristerIdentity).query(api.polls.listForMember, {});

  expect(polls[0].outcome).toBeNull();
});

test("a Member who has answered nothing is not_started", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }],
  });

  const polls = await t.withIdentity(choristerIdentity).query(api.polls.listForMember, {});

  expect(polls[0]).toMatchObject({ candidateDateCount: 2, responseState: "not_started" });
});

test("a Member who has answered some of the dates is partial", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }],
  });
  const [first] = await candidateDateIds(t, pollId);
  await t
    .withIdentity(choristerIdentity)
    .mutation(api.polls.setAvailability, { candidateDateId: first, value: "if_needed" });

  const polls = await t.withIdentity(choristerIdentity).query(api.polls.listForMember, {});

  expect(polls[0].responseState).toBe("partial");
});

test("a Member who has answered every date is complete", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asChorister = t.withIdentity(choristerIdentity);
  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }],
  });
  for (const candidateDateId of await candidateDateIds(t, pollId)) {
    await asChorister.mutation(api.polls.setAvailability, { candidateDateId, value: "available" });
  }

  const polls = await asChorister.query(api.polls.listForMember, {});

  expect(polls[0].responseState).toBe("complete");
});

// The response state is the *viewer's* own, not the roster's — a Poll every
// other Member has answered still reads as not_started to the one who hasn't.
test("another Member's answers do not count towards the viewer's state", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pollId = await asDirector.mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }],
  });
  const [only] = await candidateDateIds(t, pollId);
  await asDirector.mutation(api.polls.setAvailability, { candidateDateId: only, value: "available" });

  const polls = await t.withIdentity(choristerIdentity).query(api.polls.listForMember, {});

  expect(polls[0].responseState).toBe("not_started");
});

test("a Chorister may list every Poll — authoring is what needs managePolls", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }],
  });

  const polls = await t.withIdentity(choristerIdentity).query(api.polls.listForMember, {});

  expect(polls.map((poll) => poll.title)).toEqual(["Spring Concert"]);
});

// No Poll is reachable without signing in (#9): the list names Polls the
// Choir is running, and the grid behind each one names identifiable Members.
test("an anonymous caller is refused the list", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);

  await expect(t.query(api.polls.listForMember, {})).rejects.toThrow(/Not signed in/);
});

// Bounded rather than collected: the list is a Member's way into a Poll, not
// an archive browser, and an unbounded read would grow without limit.
test("the list is bounded at 50 Polls per section", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);

  await t.run(async (ctx) => {
    for (let i = 0; i < 51; i += 1) {
      await ctx.db.insert("polls", {
        title: `Poll ${i}`,
        status: "open",
        updatedAt: MARCH_1,
        createdByMemberId: directorId,
      });
    }
  });

  const polls = await t.withIdentity(choristerIdentity).query(api.polls.listForMember, {});

  expect(polls).toHaveLength(50);
});

// The read of the viewer's own Availabilities is bounded, so it has to be
// newest-first: truncating the oldest answers costs nothing (they belong to
// Polls already past the list's own cut), while truncating the newest would
// report the Polls actually on screen as unanswered.
test("a Member with more answers than the read bound still gets the newest Poll right", async () => {
  const t = convexTest(schema, modules);
  const { directorId, choristerId } = await seedMembers(t);

  // Enough old answers to fill the 1000-row bound on their own.
  await t.run(async (ctx) => {
    const oldPollId = await ctx.db.insert("polls", {
      title: "Years of answered Polls",
      status: "closed",
      updatedAt: MARCH_1,
      createdByMemberId: directorId,
    });
    for (let i = 0; i < 1000; i += 1) {
      const candidateDateId = await ctx.db.insert("candidateDates", {
        pollId: oldPollId,
        startsAt: MARCH_1 + i * DAY,
        displayOrder: i,
      });
      await ctx.db.insert("availabilities", {
        candidateDateId,
        memberId: choristerId,
        value: "available",
      });
    }
  });

  const asChorister = t.withIdentity(choristerIdentity);
  const pollId = await t.withIdentity(directorIdentity).mutation(api.polls.create, {
    title: "Spring Concert",
    candidateDates: [{ startsAt: MARCH_1 }, { startsAt: MARCH_1 + DAY }],
  });
  for (const candidateDateId of await candidateDateIds(t, pollId)) {
    await asChorister.mutation(api.polls.setAvailability, { candidateDateId, value: "available" });
  }

  const polls = await asChorister.query(api.polls.listForMember, {});

  expect(polls[0]).toMatchObject({ title: "Spring Concert", responseState: "complete" });
});

// listForMember reads one Poll's Candidate Dates per row, so that read is
// capped too — 50 Polls must not mean 50 unbounded reads.
test("a Poll's Candidate Dates are read under a cap", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);

  await t.run(async (ctx) => {
    const pollId = await ctx.db.insert("polls", {
      title: "Absurdly many dates",
      status: "open",
      updatedAt: MARCH_1,
      createdByMemberId: directorId,
    });
    for (let i = 0; i < 60; i += 1) {
      await ctx.db.insert("candidateDates", {
        pollId,
        startsAt: MARCH_1 + i * DAY,
        displayOrder: i,
      });
    }
  });

  const polls = await t.withIdentity(choristerIdentity).query(api.polls.listForMember, {});

  expect(polls[0].candidateDateCount).toBe(50);
});
