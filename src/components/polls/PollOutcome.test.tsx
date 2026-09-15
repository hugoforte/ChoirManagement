// Presentational like AvailabilityGrid, so these render it against the
// polls.getGrid shape directly — no convex/react mock. A MemoryRouter is
// needed only because the winning outcome links out to its Event.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";
import type { PollGrid } from "./AvailabilityGrid";
import { PollOutcome } from "./PollOutcome";

const MARCH_1 = new Date(2026, 2, 1).getTime();
const MARCH_8 = new Date(2026, 2, 8).getTime();

const candidateDates: PollGrid["candidateDates"] = [
  {
    _id: "date_1" as Id<"candidateDates">,
    _creationTime: 0,
    pollId: "poll_1" as Id<"polls">,
    startsAt: MARCH_1,
    endsAt: undefined,
    displayOrder: 0,
  },
  {
    _id: "date_2" as Id<"candidateDates">,
    _creationTime: 0,
    pollId: "poll_1" as Id<"polls">,
    startsAt: MARCH_8,
    endsAt: undefined,
    displayOrder: 1,
  },
];

function closedPoll(overrides: Partial<PollGrid["poll"]> = {}): PollGrid["poll"] {
  return {
    _id: "poll_1" as Id<"polls">,
    _creationTime: 0,
    title: "Spring Concert",
    description: undefined,
    location: undefined,
    status: "closed",
    deadlineAt: undefined,
    winningCandidateDateId: undefined,
    resultingEventId: undefined,
    updatedAt: 0,
    createdByMemberId: "member_1" as Id<"members">,
    updatedByMemberId: undefined,
    ...overrides,
  };
}

function renderOutcome(poll: PollGrid["poll"]) {
  return render(
    <MemoryRouter>
      <PollOutcome poll={poll} candidateDates={candidateDates} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("PollOutcome", () => {
  test("names the Candidate Date that won", () => {
    renderOutcome(closedPoll({ winningCandidateDateId: "date_2" as Id<"candidateDates"> }));

    expect(screen.getByText(/This Poll settled on 2026-03-08/)).toBeInTheDocument();
  });

  test("links to the Event the winning date became", () => {
    renderOutcome(
      closedPoll({
        winningCandidateDateId: "date_2" as Id<"candidateDates">,
        resultingEventId: "event_1" as Id<"events">,
      }),
    );

    expect(screen.getByRole("link", { name: "View the Event" })).toHaveAttribute("href", "/events/event_1");
  });

  test("says so when the Poll closed with no winner", () => {
    renderOutcome(closedPoll());

    expect(screen.getByText(/closed with no winning date/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View the Event" })).not.toBeInTheDocument();
  });
});
