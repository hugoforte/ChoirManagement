// Removing a Candidate Date once responses exist (#86). Clerk and
// convex/react are mocked at the module boundary (see #34 and
// src/test/convexMocks.ts); what's under test is the confirmation step
// standing between the Remove button and polls.removeCandidateDate, and the
// count of answers it says will be destroyed.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { ThemeProvider } from "../design/ThemeProvider";
import { asMutation } from "../test/convexMocks";
import PollManageDetail from "./PollManageDetail";

vi.mock("@clerk/clerk-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/clerk-react")>();
  return {
    ...actual,
    useAuth: vi.fn(),
    SignOutButton: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const MARCH_1 = new Date(2026, 2, 1).getTime();
const MARCH_8 = new Date(2026, 2, 8).getTime();

const viewer: Doc<"members"> = {
  _id: "member_1" as Id<"members">,
  _creationTime: 0,
  clerkUserId: "issuer|subject",
  name: "Dana Director",
  email: "dana@example.com",
  role: "director",
};

const removeCandidateDate = vi.fn();

type Tally = { available: number; unavailable: number; if_needed: number; notAnswered: number };

function renderPoll({
  status = "open" as Doc<"polls">["status"],
  tallies = [
    { available: 2, unavailable: 1, if_needed: 0, notAnswered: 4 },
    { available: 0, unavailable: 0, if_needed: 0, notAnswered: 7 },
  ] as Tally[],
} = {}) {
  const grid = {
    poll: {
      _id: "poll_1" as Id<"polls">,
      _creationTime: 0,
      title: "Spring Concert",
      description: undefined,
      location: undefined,
      status,
      deadlineAt: undefined,
      winningCandidateDateId: undefined,
      resultingEventId: undefined,
      updatedAt: 0,
      createdByMemberId: viewer._id,
      updatedByMemberId: undefined,
    },
    candidateDates: [
      { _id: "date_1" as Id<"candidateDates">, _creationTime: 0, pollId: "poll_1" as Id<"polls">, startsAt: MARCH_1, endsAt: undefined, displayOrder: 0 },
      { _id: "date_2" as Id<"candidateDates">, _creationTime: 0, pollId: "poll_1" as Id<"polls">, startsAt: MARCH_8, endsAt: undefined, displayOrder: 1 },
    ],
    rows: [{ memberId: viewer._id, name: "Dana Director", isViewer: true, values: ["available", null] }],
    tallies,
  };

  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useQuery).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.members.viewer)) return viewer;
    if (name === getFunctionName(api.choirSettings.get)) return { name: "Riverside Choir", logoUrl: null };
    if (name === getFunctionName(api.polls.getGrid)) return grid;
    // AppShell subscribes to this for the Bulletins unread dot (#82); this
    // file renders the real shell, so it sees the call.
    if (name === getFunctionName(api.bulletins.hasUnread)) return false;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);

  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/polls/manage/poll_1"]}>
        <Routes>
          <Route path="/polls/manage/:pollId" element={<PollManageDetail />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function clickRemoveFor(dateLabel: string) {
  fireEvent.click(screen.getByRole("button", { name: `Remove ${dateLabel}` }));
}

beforeEach(() => {
  removeCandidateDate.mockReset();
  vi.mocked(useMutation).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(query) === getFunctionName(api.polls.removeCandidateDate)
      ? asMutation(removeCandidateDate)
      : asMutation(vi.fn())) as typeof useMutation);
});

afterEach(cleanup);

describe("removing a Candidate Date", () => {
  test("does not remove anything on the first click", () => {
    renderPoll();

    clickRemoveFor("2026-03-01");

    expect(removeCandidateDate).not.toHaveBeenCalled();
  });

  test("names how many recorded answers the removal destroys", () => {
    renderPoll();

    clickRemoveFor("2026-03-01");

    expect(screen.getByRole("alert")).toHaveTextContent("3 recorded answers");
  });

  test("counts only the answers on the date being removed", () => {
    renderPoll();

    clickRemoveFor("2026-03-08");

    expect(screen.getByRole("alert")).toHaveTextContent("no answers recorded yet");
  });

  test("uses the singular for a single answer", () => {
    renderPoll({ tallies: [{ available: 0, unavailable: 0, if_needed: 1, notAnswered: 6 }, { available: 0, unavailable: 0, if_needed: 0, notAnswered: 7 }] });

    clickRemoveFor("2026-03-01");

    expect(screen.getByRole("alert")).toHaveTextContent("1 recorded answer");
  });

  test("removes the date once the removal is confirmed", () => {
    renderPoll();

    clickRemoveFor("2026-03-01");
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove it" }));

    expect(removeCandidateDate).toHaveBeenCalledWith({ candidateDateId: "date_1" });
  });

  test("keeps the date when the removal is cancelled", () => {
    renderPoll();

    clickRemoveFor("2026-03-01");
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(removeCandidateDate).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("moves focus onto the confirm button when the warning opens", () => {
    renderPoll();

    clickRemoveFor("2026-03-01");

    expect(screen.getByRole("button", { name: "Yes, remove it" })).toHaveFocus();
  });

  test("returns focus to the Remove button it came from when cancelled", () => {
    renderPoll();

    clickRemoveFor("2026-03-01");
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(screen.getByRole("button", { name: "Remove 2026-03-01" })).toHaveFocus();
  });

  test("leaves the other dates' controls usable while one is confirming", () => {
    renderPoll();

    clickRemoveFor("2026-03-01");

    expect(screen.getByRole("button", { name: "Remove 2026-03-01" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove 2026-03-08" })).toBeEnabled();
  });

  test("confirms one Candidate Date at a time", () => {
    renderPoll();

    clickRemoveFor("2026-03-01");
    clickRemoveFor("2026-03-08");

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("2026-03-08");
  });
});

describe("a closed Poll", () => {
  test("offers no way to remove a Candidate Date", () => {
    renderPoll({ status: "closed" });

    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.getByText("This Poll is closed. Closed Polls are read-only.")).toBeInTheDocument();
  });

  test("disables saving the Poll's metadata", () => {
    renderPoll({ status: "closed" });

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
