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

// The open half of `list`, the manager-gated surface that carries the
// closed history after it. `listForMember` reads the same index on its own
// lower bound (see MEMBER_POLL_LIMIT).
async function openPollsNewestFirst(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("polls")
    .withIndex("by_status", (q) => q.eq("status", "open"))
    .order("desc")
    .take(200);
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
    const open = await openPollsNewestFirst(ctx);
    const closed = await ctx.db
      .query("polls")
      .withIndex("by_status", (q) => q.eq("status", "closed"))
      .order("desc")
      .take(200);
    return [...open, ...closed];
  },
});

const availabilityValue = schema.tables.availabilities.validator.fields.value;

// `if_needed` keeps the schema's own spelling rather than being camelCased
// at this boundary, so a tally is incremented by `tally[value]` straight
// from an Availability's value with no mapping table in between.
//
// Every value gets its own count, plus the Members who haven't answered —
// the most useful number on the grid (#9), and the reason guest responses
// are excluded. `if_needed` is never folded into `unavailable`.
const availabilityTally = v.object({
  available: v.number(),
  unavailable: v.number(),
  if_needed: v.number(),
  notAnswered: v.number(),
});

// requireMember, not requireCan: responding is what every Member does, and
// managePolls is what a Director needs to *author* the Poll (#9). The
// Member is taken from the caller's identity, never from an argument.
//
// Deliberately does not touchPoll: answering a Poll is not editing it, and
// stamping updatedByMemberId on every response would rewrite the audit
// trail #84 keeps for the Director who owns the Poll's contents.
export const setAvailability = mutation({
  args: {
    candidateDateId: v.id("candidateDates"),
    value: availabilityValue,
  },
  returns: v.null(),
  handler: async (ctx, { candidateDateId, value }) => {
    const member = await requireMember(ctx);
    const candidateDate = await ctx.db.get("candidateDates", candidateDateId);
    if (!candidateDate) throw new Error("Candidate Date not found");
    await requireOpenPoll(ctx, candidateDate.pollId);

    // One Availability per Member per Candidate Date, upserted on the
    // compound index — the same lookup-then-patch shape events.rsvp uses,
    // because Convex doesn't enforce uniqueness itself.
    const existing = await ctx.db
      .query("availabilities")
      .withIndex("by_candidate_date_id_and_member_id", (q) =>
        q.eq("candidateDateId", candidateDateId).eq("memberId", member._id),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("availabilities", existing._id, { value });
    } else {
      await ctx.db.insert("availabilities", { candidateDateId, memberId: member._id, value });
    }
    return null;
  },
});

// The whole named grid in one subscription: every Member as a row, every
// Candidate Date as a column, and a null wherever a Member hasn't answered
// yet. Open to every signed-in Member while the Poll runs (#9) — seeing the
// gaps is what makes a Poll self-policing.
//
// `values` and `tallies` are positional: index i of both lines up with
// index i of `candidateDates`, so the client renders columns without
// looking anything up by id.
export const getGrid = query({
  args: { pollId: v.id("polls") },
  returns: v.union(
    v.null(),
    v.object({
      poll: schema.doc("polls"),
      candidateDates: v.array(schema.doc("candidateDates")),
      rows: v.array(
        v.object({
          memberId: v.id("members"),
          name: v.string(),
          isViewer: v.boolean(),
          values: v.array(v.union(availabilityValue, v.null())),
        }),
      ),
      tallies: v.array(availabilityTally),
    }),
  ),
  handler: async (ctx, { pollId }) => {
    const viewer = await requireMember(ctx);
    const poll = await ctx.db.get("polls", pollId);
    if (!poll) return null;

    const candidateDates = await candidateDatesInOrder(ctx, pollId);
    // Members once and Availabilities once per Candidate Date, joined in
    // memory: a lookup per Member per date would be Members × dates reads
    // for the same rows. The roster is bounded the way members.list's is.
    const [members, answersPerDate] = await Promise.all([
      ctx.db.query("members").collect(),
      Promise.all(
        candidateDates.map((candidateDate) =>
          ctx.db
            .query("availabilities")
            .withIndex("by_candidate_date_id", (q) => q.eq("candidateDateId", candidateDate._id))
            .collect(),
        ),
      ),
    ]);

    const answersByDate = answersPerDate.map(
      (answers) => new Map<Id<"members">, (typeof answers)[number]["value"]>(answers.map((a) => [a.memberId, a.value])),
    );

    const rows = members
      .map((member) => ({
        memberId: member._id,
        name: member.name,
        isViewer: member._id === viewer._id,
        values: answersByDate.map((byMember) => byMember.get(member._id) ?? null),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Counted off the rows rather than the raw Availabilities, so an answer
    // left behind by a deleted Member can't inflate a column.
    const tallies = candidateDates.map((_, column) => {
      const tally = { available: 0, unavailable: 0, if_needed: 0, notAnswered: 0 };
      for (const row of rows) {
        const value = row.values[column];
        if (value === null) tally.notAnswered += 1;
        else tally[value] += 1;
      }
      return tally;
    });

    return { poll, candidateDates, rows, tallies };
  },
});

// The Member-facing list (#88): open Polls first, then closed ones as
// history, each row carrying enough to decide whether to open it — how many
// dates it asks about, where the viewer stands on answering them, and for a
// closed Poll what it settled on. Replaces #85's `listOpen`, which this
// absorbs.
//
// requireMember, not requireCan: every signed-in Member sees every Poll
// (#9). `list` above is the manager's twin and stays behind managePolls.

// The newest 50 of each half. A Member scans this list to find the Poll they
// owe an answer to and to see what past Polls settled on — it is not an
// archive browser, and #88 deliberately ships no search, filter or paging
// over history. Lower than `list`'s 200 because every row here also reads
// its Poll's Candidate Dates.
const MEMBER_POLL_LIMIT = 50;

// One row per Candidate Date the viewer has ever answered, across every
// Poll. The bound only bites on a deployment with hundreds of Polls, where
// the list itself is already truncated — and truncating here can only
// understate a Member's progress, never invent an answer they didn't give.
const VIEWER_ANSWER_LIMIT = 1000;

const pollResponseState = v.union(
  v.literal("not_started"),
  v.literal("partial"),
  v.literal("complete"),
);

// A Member with no Candidate Dates left to answer has "complete"; one who
// has answered none has "not_started". A Poll carrying no Candidate Dates at
// all reads as "not_started" rather than "complete" — calling it complete
// would credit the Member with an answer they never gave.
function viewerResponseState(candidateDateCount: number, answeredCount: number) {
  if (answeredCount === 0) return "not_started" as const;
  return answeredCount === candidateDateCount ? ("complete" as const) : ("partial" as const);
}

function newestFirstForMember(ctx: QueryCtx, status: "open" | "closed") {
  return ctx.db
    .query("polls")
    .withIndex("by_status", (q) => q.eq("status", status))
    .order("desc")
    .take(MEMBER_POLL_LIMIT);
}

const memberPollListItem = v.object({
  _id: v.id("polls"),
  _creationTime: v.number(),
  title: v.string(),
  status: schema.tables.polls.validator.fields.status,
  deadlineAt: v.optional(v.number()),
  candidateDateCount: v.number(),
  responseState: pollResponseState,
  // null on an open Poll: an outcome is what closing produces (#87). A
  // closed Poll that settled on no date carries the object with both dates
  // null, which is a different thing from having no outcome yet.
  outcome: v.union(
    v.null(),
    v.object({
      winningStartsAt: v.union(v.number(), v.null()),
      winningEndsAt: v.union(v.number(), v.null()),
      resultingEventId: v.union(v.id("events"), v.null()),
    }),
  ),
});

export const listForMember = query({
  args: {},
  returns: v.array(memberPollListItem),
  handler: async (ctx) => {
    const viewer = await requireMember(ctx);

    const [open, closed] = await Promise.all([
      newestFirstForMember(ctx, "open"),
      newestFirstForMember(ctx, "closed"),
    ]);
    const polls = [...open, ...closed];

    // The viewer's answers come back in one index read for the whole list
    // and are joined in memory. Asking per Poll — or worse, per Candidate
    // Date — would be a read per row for rows this one query already holds.
    const [datesPerPoll, viewerAnswers] = await Promise.all([
      Promise.all(polls.map((poll) => candidateDatesInOrder(ctx, poll._id))),
      ctx.db
        .query("availabilities")
        .withIndex("by_member_id", (q) => q.eq("memberId", viewer._id))
        .take(VIEWER_ANSWER_LIMIT),
    ]);
    const answered = new Set<Id<"candidateDates">>(viewerAnswers.map((a) => a.candidateDateId));

    return polls.map((poll, index) => {
      const candidateDates = datesPerPoll[index];
      const answeredCount = candidateDates.filter((date) => answered.has(date._id)).length;
      const winner = candidateDates.find((date) => date._id === poll.winningCandidateDateId);

      return {
        _id: poll._id,
        _creationTime: poll._creationTime,
        title: poll.title,
        status: poll.status,
        deadlineAt: poll.deadlineAt,
        candidateDateCount: candidateDates.length,
        responseState: viewerResponseState(candidateDates.length, answeredCount),
        outcome:
          poll.status === "closed"
            ? {
                winningStartsAt: winner?.startsAt ?? null,
                winningEndsAt: winner?.endsAt ?? null,
                resultingEventId: poll.resultingEventId ?? null,
              }
            : null,
      };
    });
  },
});
