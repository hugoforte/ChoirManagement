// The prompt owed to a Member who answered before a Candidate Date was
// added (#86). Derived entirely from the grid, so these render it against
// the polls.getGrid shape directly — no convex/react mock needed.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";
import type { PollGrid } from "./AvailabilityGrid";
import { UnansweredDatesNotice } from "./UnansweredDatesNotice";

const MARCH_1 = new Date(2026, 2, 1).getTime();
const MARCH_8 = new Date(2026, 2, 8).getTime();
const MARCH_15 = new Date(2026, 2, 15).getTime();

type Answer = PollGrid["rows"][number]["values"][number];

function gridWith(viewerValues: Answer[]): PollGrid {
  const starts = [MARCH_1, MARCH_8, MARCH_15].slice(0, viewerValues.length);
  return {
    poll: {
      _id: "poll_1" as Id<"polls">,
      _creationTime: 0,
      title: "Spring Concert",
      description: undefined,
      location: undefined,
      status: "open",
      deadlineAt: undefined,
      winningCandidateDateId: undefined,
      resultingEventId: undefined,
      updatedAt: 0,
      createdByMemberId: "member_2" as Id<"members">,
      updatedByMemberId: undefined,
    },
    candidateDates: starts.map((startsAt, i) => ({
      _id: `date_${i + 1}` as Id<"candidateDates">,
      _creationTime: 0,
      pollId: "poll_1" as Id<"polls">,
      startsAt,
      endsAt: undefined,
      displayOrder: i,
    })),
    rows: [
      { memberId: "member_1" as Id<"members">, name: "Chris Chorister", isViewer: true, values: viewerValues },
      {
        memberId: "member_2" as Id<"members">,
        name: "Dana Director",
        isViewer: false,
        values: viewerValues.map(() => null),
      },
    ],
    tallies: starts.map(() => ({ available: 0, unavailable: 0, if_needed: 0, notAnswered: 2 })),
  };
}

afterEach(cleanup);

describe("UnansweredDatesNotice", () => {
  test("prompts a Member who answered some dates but not all", () => {
    render(<UnansweredDatesNotice grid={gridWith(["available", null, null])} />);

    expect(screen.getByRole("status")).toHaveTextContent("2 Candidate Dates need your answer");
  });

  test("names each date still waiting on the viewer", () => {
    render(<UnansweredDatesNotice grid={gridWith(["available", null, "unavailable"])} />);

    expect(screen.getByRole("status")).toHaveTextContent("2026-03-08");
    expect(screen.getByRole("status")).not.toHaveTextContent("2026-03-01");
  });

  test("uses the singular when one date is missing an answer", () => {
    render(<UnansweredDatesNotice grid={gridWith(["available", null])} />);

    expect(screen.getByRole("status")).toHaveTextContent("1 Candidate Date needs your answer");
  });

  test("stays silent once the viewer has answered every date", () => {
    render(<UnansweredDatesNotice grid={gridWith(["available", "if_needed"])} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("stays silent for a Member who has not answered at all", () => {
    render(<UnansweredDatesNotice grid={gridWith([null, null])} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("stays silent when the viewer has no row on the grid", () => {
    const grid = gridWith(["available", null]);
    render(<UnansweredDatesNotice grid={{ ...grid, rows: grid.rows.filter((r) => !r.isViewer) }} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
