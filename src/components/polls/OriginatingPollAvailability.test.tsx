// The section an Event created by promotion shows instead of RSVPs it never
// received. The one thing that must not regress: it reads as availability
// from a Poll, never as an RSVP (ADR-0005).
import { cleanup, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";
import { OriginatingPollAvailability } from "./OriginatingPollAvailability";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const MARCH_1 = new Date(2026, 2, 1).getTime();

function renderSection(grid: unknown) {
  vi.mocked(useQuery).mockReturnValue(grid);
  return render(
    <MemoryRouter>
      <OriginatingPollAvailability eventId={"event_1" as Id<"events">} />
    </MemoryRouter>,
  );
}

function gridForPoll() {
  return {
    poll: {
      _id: "poll_1" as Id<"polls">,
      _creationTime: 0,
      title: "Spring Concert",
      description: undefined,
      location: undefined,
      status: "closed" as const,
      deadlineAt: undefined,
      winningCandidateDateId: "date_1" as Id<"candidateDates">,
      resultingEventId: "event_1" as Id<"events">,
      updatedAt: 0,
      createdByMemberId: "member_1" as Id<"members">,
      updatedByMemberId: undefined,
    },
    candidateDates: [
      { _id: "date_1" as Id<"candidateDates">, _creationTime: 0, pollId: "poll_1" as Id<"polls">, startsAt: MARCH_1, endsAt: undefined, displayOrder: 0 },
    ],
    rows: [
      { memberId: "member_1" as Id<"members">, name: "Chris Chorister", isViewer: true, values: ["available" as const] },
    ],
    tallies: [{ available: 1, unavailable: 0, if_needed: 0, notAnswered: 0 }],
  };
}

afterEach(cleanup);

describe("OriginatingPollAvailability", () => {
  test("labels the section as availability from the Poll", () => {
    renderSection(gridForPoll());

    expect(screen.getByRole("heading", { name: "Availability from the Poll" })).toBeInTheDocument();
  });

  test("says outright that these answers are not RSVPs", () => {
    renderSection(gridForPoll());

    expect(screen.getByText(/they are not RSVPs/)).toBeInTheDocument();
  });

  test("links back to the Poll the Event came from", () => {
    renderSection(gridForPoll());

    expect(screen.getByRole("link", { name: "Spring Concert" })).toHaveAttribute("href", "/polls/poll_1");
  });

  test("renders the grid read-only, with no way to answer", () => {
    renderSection(gridForPoll());

    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("renders nothing for an Event no Poll produced", () => {
    const { container } = renderSection(null);

    expect(container).toBeEmptyDOMElement();
  });
});
