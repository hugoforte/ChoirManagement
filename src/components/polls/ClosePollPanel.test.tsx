// The panel is presentational apart from the polls.close mutation it owns,
// so only convex/react's useMutation needs mocking (see #34 and
// src/test/convexMocks.ts). What matters here: both ways of closing state
// their consequence before anything happens, the confirmation names only the
// start the Event will actually carry, and a closed Poll offers no way back.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMutation } from "convex/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { asMutation } from "../../test/convexMocks";
import type { PollGrid } from "./AvailabilityGrid";
import { ClosePollPanel } from "./ClosePollPanel";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const MARCH_1 = new Date(2026, 2, 1).getTime();
const MARCH_8 = new Date(2026, 2, 8).getTime();
const MARCH_8_EVENING = new Date(2026, 2, 8, 19, 30).getTime();
const MARCH_8_NIGHT = new Date(2026, 2, 8, 21, 0).getTime();

const closePoll = vi.fn();

function gridWith(
  pollOverrides: Partial<Doc<"polls">> = {},
  candidateDateOverrides: Partial<Doc<"candidateDates">>[] = [],
): PollGrid {
  const dates = [
    { _id: "date_1" as Id<"candidateDates">, _creationTime: 0, pollId: "poll_1" as Id<"polls">, startsAt: MARCH_1, endsAt: undefined, displayOrder: 0 },
    { _id: "date_2" as Id<"candidateDates">, _creationTime: 0, pollId: "poll_1" as Id<"polls">, startsAt: MARCH_8, endsAt: undefined, displayOrder: 1 },
  ].map((date, i) => ({ ...date, ...candidateDateOverrides[i] }));

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
      ...pollOverrides,
    },
    candidateDates: dates,
    rows: [],
    tallies: [
      { available: 3, unavailable: 0, if_needed: 1, notAnswered: 0 },
      { available: 1, unavailable: 2, if_needed: 0, notAnswered: 1 },
    ],
  };
}

function renderPanel(grid: PollGrid = gridWith()) {
  return render(
    <MemoryRouter>
      <ClosePollPanel grid={grid} />
    </MemoryRouter>,
  );
}

function pickAndConfirmWinner() {
  fireEvent.click(screen.getByLabelText(/2026-03-08/));
  fireEvent.click(screen.getByRole("button", { name: "Close and create Event" }));
}

beforeEach(() => {
  closePoll.mockReset();
  vi.mocked(useMutation).mockReturnValue(asMutation(closePoll));
});

afterEach(cleanup);

describe("ClosePollPanel", () => {
  test("warns that a closed Poll cannot be reopened before creating the Event", () => {
    renderPanel();

    pickAndConfirmWinner();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Close this Poll on 2026-03-08 and create an Event? A closed Poll is read-only and cannot be reopened.",
    );
  });

  test("names only the start, and says the end time is dropped, for a Candidate Date with a window", () => {
    renderPanel(gridWith({}, [{}, { startsAt: MARCH_8_EVENING, endsAt: MARCH_8_NIGHT }]));

    fireEvent.click(screen.getByLabelText(/2026-03-08 19:30–21:00/));
    fireEvent.click(screen.getByRole("button", { name: "Close and create Event" }));

    // The Event gets a start and nothing else — `events` has no end field.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Close this Poll on 2026-03-08 19:30 and create an Event? The Event starts then; the end time is not carried over.",
    );
  });

  test("warns that closing with no winner creates no Event", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Close with no winner" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Close this Poll with no winner? No Event is created, and a closed Poll is read-only and cannot be reopened.",
    );
  });

  test("says up front that the end time is not carried over", () => {
    renderPanel();

    expect(screen.getByText(/end time is not carried over/)).toBeInTheDocument();
  });

  test("closes nothing until the confirmation is accepted", () => {
    renderPanel();

    pickAndConfirmWinner();

    expect(closePoll).not.toHaveBeenCalled();
  });

  test("closes on the Candidate Date the Director picked", () => {
    renderPanel();

    pickAndConfirmWinner();
    fireEvent.click(screen.getByRole("button", { name: "Yes, close and create it" }));

    expect(closePoll).toHaveBeenCalledWith({ pollId: "poll_1", winningCandidateDateId: "date_2" });
  });

  test("closes with no winner without naming a Candidate Date", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Close with no winner" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, close with no winner" }));

    expect(closePoll).toHaveBeenCalledWith({ pollId: "poll_1" });
  });

  test("closes nothing when the confirmation is dismissed", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Close with no winner" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it open" }));

    expect(closePoll).not.toHaveBeenCalled();
  });

  test("puts focus on the confirm button when the confirmation opens", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Close with no winner" }));

    expect(screen.getByRole("button", { name: "Yes, close with no winner" })).toHaveFocus();
  });

  test("puts focus back on the control it came from when dismissed", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Close with no winner" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it open" }));

    expect(screen.getByRole("button", { name: "Close with no winner" })).toHaveFocus();
  });

  test("offers no winner until one is chosen", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Close and create Event" })).toBeDisabled();
  });

  test("shows each Candidate Date's tally to choose by", () => {
    renderPanel();

    expect(screen.getByLabelText(/2026-03-01/)).toHaveAccessibleName(
      /3 available · 1 if needed · 0 unavailable · 0 not answered yet/,
    );
  });

  test("links a closed Poll to the Event it produced", () => {
    renderPanel(
      gridWith({
        status: "closed",
        winningCandidateDateId: "date_1" as Id<"candidateDates">,
        resultingEventId: "event_1" as Id<"events">,
      }),
    );

    expect(screen.getByRole("link", { name: "Open the Event this created" })).toHaveAttribute("href", "/events/event_1");
  });

  test("reports a Poll closed with no winner as having created nothing", () => {
    renderPanel(gridWith({ status: "closed" }));

    expect(screen.getByText(/Closed with no winner/)).toBeInTheDocument();
  });

  test("offers no way to reopen a closed Poll", () => {
    renderPanel(gridWith({ status: "closed" }));

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
