// The grid is presentational (the route owns the polls.getGrid subscription),
// so these render it against the query's own return shape directly — no
// convex/react mock is needed, and #88 can lean on the same coverage when
// it reuses the component read-only.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";
import { AvailabilityGrid, type PollGrid } from "./AvailabilityGrid";

const MARCH_1 = new Date(2026, 2, 1).getTime();
const MARCH_8 = new Date(2026, 2, 8).getTime();

function gridWith(overrides: Partial<PollGrid> = {}): PollGrid {
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
      createdByMemberId: "member_1" as Id<"members">,
      updatedByMemberId: undefined,
    },
    candidateDates: [
      { _id: "date_1" as Id<"candidateDates">, _creationTime: 0, pollId: "poll_1" as Id<"polls">, startsAt: MARCH_1, endsAt: undefined, displayOrder: 0 },
      { _id: "date_2" as Id<"candidateDates">, _creationTime: 0, pollId: "poll_1" as Id<"polls">, startsAt: MARCH_8, endsAt: undefined, displayOrder: 1 },
    ],
    rows: [
      { memberId: "member_1" as Id<"members">, name: "Chris Chorister", isViewer: true, values: ["available", null] },
      { memberId: "member_2" as Id<"members">, name: "Dana Director", isViewer: false, values: ["if_needed", null] },
    ],
    tallies: [
      { available: 1, unavailable: 0, if_needed: 1, notAnswered: 0 },
      { available: 0, unavailable: 0, if_needed: 0, notAnswered: 2 },
    ],
    ...overrides,
  };
}

function rowFor(name: string) {
  return screen.getByRole("row", { name: new RegExp(name) });
}

afterEach(cleanup);

describe("AvailabilityGrid", () => {
  test("names every Member, including one who has not answered", () => {
    render(<AvailabilityGrid grid={gridWith()} onSet={vi.fn()} />);

    expect(within(rowFor("Dana Director")).getByText("No answer")).toBeInTheDocument();
  });

  test("shows a not-answered tally per Candidate Date", () => {
    render(<AvailabilityGrid grid={gridWith()} onSet={vi.fn()} />);

    expect(screen.getByText("2 not answered yet")).toBeInTheDocument();
  });

  test("keeps if needed out of the unavailable tally", () => {
    render(<AvailabilityGrid grid={gridWith()} onSet={vi.fn()} />);

    const marchFirst = within(screen.getByRole("row", { name: /Tally/ })).getAllByRole("cell")[0];
    expect(within(marchFirst).getByText("1 if needed")).toBeInTheDocument();
    expect(within(marchFirst).getByText("0 unavailable")).toBeInTheDocument();
  });

  test("marks the viewer's current answer as pressed", () => {
    render(<AvailabilityGrid grid={gridWith()} onSet={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Available on 2026-03-01" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "If needed on 2026-03-01" })).toHaveAttribute("aria-pressed", "false");
  });

  test("reports the Candidate Date and value the viewer picked", () => {
    const onSet = vi.fn();
    render(<AvailabilityGrid grid={gridWith()} onSet={onSet} />);

    fireEvent.click(screen.getByRole("button", { name: "If needed on 2026-03-08" }));

    expect(onSet).toHaveBeenCalledWith("date_2", "if_needed");
  });

  test("offers controls only on the viewer's own row", () => {
    render(<AvailabilityGrid grid={gridWith()} onSet={vi.fn()} />);

    expect(within(rowFor("Dana Director")).queryByRole("button")).not.toBeInTheDocument();
  });

  test("renders read-only without onSet, as a closed Poll does", () => {
    render(<AvailabilityGrid grid={gridWith()} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(within(rowFor("Chris Chorister")).getByText("Available")).toBeInTheDocument();
  });

  test("says so when the Poll has no Candidate Dates", () => {
    render(<AvailabilityGrid grid={gridWith({ candidateDates: [], rows: [], tallies: [] })} />);

    expect(screen.getByText("No Candidate Dates yet.")).toBeInTheDocument();
  });
});
