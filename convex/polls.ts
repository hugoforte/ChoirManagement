// Poll authoring (#84): create a Poll with its Candidate Dates, edit its
// draft Event metadata and advisory deadline, and add/remove/reorder the
// dates while it is open. Responding is #85, editing after responses exist
// is #86, closing and promotion is #87.
//
// A Poll is not a proposed Event (ADR-0005): it carries *draft* metadata
// alongside dates that nothing is scheduled on yet.
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireMember, requireCan } from "./lib/auth";
import { normalizeOptionalText } from "./lib/text";
import schema from "./schema";

// One Candidate Date as a caller supplies it: a start, plus an optional end
// giving a time window. `startsAt` is represented identically to
// events.startsAt so #87's promotion is a straight copy — a date-only
// Candidate Date carries local midnight (ADR-0005's one Choir, one time
// zone).
const candidateDateInput = v.object({
  startsAt: v.number(),
  endsAt: v.optional(v.number()),
});

function validateWindow(startsAt: number, endsAt: number | undefined) {
  if (!Number.isFinite(startsAt)) {
    throw new Error("A Candidate Date needs a valid start");
  }
  if (endsAt !== undefined && endsAt <= startsAt) {
    throw new Error("A Candidate Date's end must be after its start");
  }
}

// The read-only rule for a closed Poll (#9), in the one place every mutation
// passes through — so #86 and #87 can't add a mutation that forgets it.
async function requireOpenPoll(ctx: MutationCtx, pollId: Id<"polls">) {
  const poll = await ctx.db.get("polls", pollId);
  if (!poll) throw new Error("Poll not found");
  if (poll.status === "closed") throw new Error("A closed Poll is read-only");
  return poll;
}

// Editing a Candidate Date is editing its Poll, so the Poll's own audit
// stamp moves too — a Director looking at the list sees the Poll change
// when its dates do.
async function touchPoll(ctx: MutationCtx, pollId: Id<"polls">, memberId: Id<"members">) {
  await ctx.db.patch("polls", pollId, { updatedAt: Date.now(), updatedByMemberId: memberId });
}

async function candidateDatesInOrder(ctx: QueryCtx | MutationCtx, pollId: Id<"polls">) {
  // Bounded by one Poll's own authoring — a handful of dates, the same
  // shape as events.roster collecting one Event's RSVPs.
  return await ctx.db
    .query("candidateDates")
    .withIndex("by_poll_id_and_display_order", (q) => q.eq("pollId", pollId))
    .order("asc")
    .collect();
}

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    // Advisory only: displayed, never enforced, and it never auto-closes the
    // Poll (#9).
    deadlineAt: v.optional(v.number()),
    candidateDates: v.array(candidateDateInput),
  },
  returns: v.id("polls"),
  handler: async (ctx, args) => {
    const member = await requireCan(ctx, "managePolls");
    for (const date of args.candidateDates) validateWindow(date.startsAt, date.endsAt);

    const pollId = await ctx.db.insert("polls", {
      title: args.title,
      description: normalizeOptionalText(args.description),
      location: normalizeOptionalText(args.location),
      status: "open",
      deadlineAt: args.deadlineAt,
      winningCandidateDateId: undefined,
      resultingEventId: undefined,
      updatedAt: Date.now(),
      createdByMemberId: member._id,
      updatedByMemberId: undefined,
    });

    // displayOrder is the order the Director listed them in, not the
    // chronological one — reordering is an explicit action (#84).
    await Promise.all(
      args.candidateDates.map((date, displayOrder) =>
        ctx.db.insert("candidateDates", {
          pollId,
          startsAt: date.startsAt,
          endsAt: date.endsAt,
          displayOrder,
        }),
      ),
    );

    return pollId;
  },
});

export const update = mutation({
  args: {
    pollId: v.id("polls"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    // `null` clears the deadline. An explicit `undefined` is dropped before
    // it reaches the handler — indistinguishable from an omitted key — so a
    // number field needs a real value to mean "clear", the way "" does for
    // the text fields (see convex/lib/text.ts).
    deadlineAt: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { pollId, title, description, location, deadlineAt }) => {
    const member = await requireCan(ctx, "managePolls");
    await requireOpenPoll(ctx, pollId);

    await ctx.db.patch("polls", pollId, {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: normalizeOptionalText(description) }),
      ...(location !== undefined && { location: normalizeOptionalText(location) }),
      ...(deadlineAt !== undefined && { deadlineAt: deadlineAt ?? undefined }),
      updatedAt: Date.now(),
      updatedByMemberId: member._id,
    });
    return null;
  },
});

export const addCandidateDate = mutation({
  args: {
    pollId: v.id("polls"),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
  },
  returns: v.id("candidateDates"),
  handler: async (ctx, { pollId, startsAt, endsAt }) => {
    const member = await requireCan(ctx, "managePolls");
    await requireOpenPoll(ctx, pollId);
    validateWindow(startsAt, endsAt);

    const last = await ctx.db
      .query("candidateDates")
      .withIndex("by_poll_id_and_display_order", (q) => q.eq("pollId", pollId))
      .order("desc")
      .first();

    const candidateDateId = await ctx.db.insert("candidateDates", {
      pollId,
      startsAt,
      endsAt,
      displayOrder: (last?.displayOrder ?? -1) + 1,
    });
    await touchPoll(ctx, pollId, member._id);
    return candidateDateId;
  },
});

// Deleting the Candidate Date's Availabilities is the correct cascade
// whatever the UI does about it: an Availability is an answer about a date
// that no longer exists. #86 owns warning the Director how many answers
// that destroys before they confirm.
export const removeCandidateDate = mutation({
  args: { candidateDateId: v.id("candidateDates") },
  returns: v.null(),
  handler: async (ctx, { candidateDateId }) => {
    const member = await requireCan(ctx, "managePolls");
    const candidateDate = await ctx.db.get("candidateDates", candidateDateId);
    if (!candidateDate) throw new Error("Candidate Date not found");
    await requireOpenPoll(ctx, candidateDate.pollId);

    const availabilities = await ctx.db
      .query("availabilities")
      .withIndex("by_candidate_date_id", (q) => q.eq("candidateDateId", candidateDateId))
      .collect();
    await Promise.all(availabilities.map((a) => ctx.db.delete("availabilities", a._id)));

    await ctx.db.delete("candidateDates", candidateDateId);
    await touchPoll(ctx, candidateDate.pollId, member._id);
    return null;
  },
});

// Takes the whole ordered list rather than a move instruction, the same
// shape events.update's `setlist` uses — the client already holds the
// order it wants, and renumbering from scratch can't leave a gap or a tie.
export const reorderCandidateDates = mutation({
  args: {
    pollId: v.id("polls"),
    candidateDateIds: v.array(v.id("candidateDates")),
  },
  returns: v.null(),
  handler: async (ctx, { pollId, candidateDateIds }) => {
    const member = await requireCan(ctx, "managePolls");
    await requireOpenPoll(ctx, pollId);

    const existing = await candidateDatesInOrder(ctx, pollId);
    const existingIds = new Set<string>(existing.map((c) => c._id));
    const givenIds = new Set<string>(candidateDateIds);
    const isPermutation =
      givenIds.size === candidateDateIds.length &&
      givenIds.size === existingIds.size &&
      candidateDateIds.every((id) => existingIds.has(id));
    if (!isPermutation) {
      throw new Error("A reorder must list every Candidate Date on the Poll exactly once");
    }

    await Promise.all(
      candidateDateIds.map((candidateDateId, displayOrder) =>
        ctx.db.patch("candidateDates", candidateDateId, { displayOrder }),
      ),
    );
    await touchPoll(ctx, pollId, member._id);
    return null;
  },
});

// requireMember, not requireCan: every signed-in Member can see every Poll
// and its dates (#9's access policy). Authoring is what needs managePolls.
export const get = query({
  args: { pollId: v.id("polls") },
  returns: v.union(
    v.null(),
    v.object({
      ...schema.tables.polls.validator.fields,
      _id: v.id("polls"),
      _creationTime: v.number(),
      candidateDates: v.array(schema.doc("candidateDates")),
    }),
  ),
  handler: async (ctx, { pollId }) => {
    await requireMember(ctx);
    const poll = await ctx.db.get("polls", pollId);
    if (!poll) return null;
    return { ...poll, candidateDates: await candidateDatesInOrder(ctx, pollId) };
  },
});

// Open Polls first, then closed ones as history, newest first within each —
// the same two-half shape events.list uses, on the _creationTime Convex
// appends to by_status. #88 owns the Member-facing list.
export const list = query({
  args: {},
  returns: v.array(schema.doc("polls")),
  handler: async (ctx) => {
    await requireCan(ctx, "managePolls");
    const open = await ctx.db
      .query("polls")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(200);
    const closed = await ctx.db
      .query("polls")
      .withIndex("by_status", (q) => q.eq("status", "closed"))
      .order("desc")
      .take(200);
    return [...open, ...closed];
  },
});
