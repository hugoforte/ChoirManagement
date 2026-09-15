// Renders the real MemberPage and AppShell, mocking Clerk and convex/react
// at the module boundary (see #34 and src/test/convexMocks.ts) — what's
// under test is the route wiring the grid to polls.setAvailability, and the
// read-only rendering a closed Poll gets. The grid's own behaviour is
// covered in src/components/polls/AvailabilityGrid.test.tsx.
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
import PollDetail from "./PollDetail";

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
  name: "Chris Chorister",
  email: "chris@example.com",
  role: "chorister",
};

const setAvailability = vi.fn();

type Answer = "available" | "unavailable" | "if_needed" | null;

function renderPoll({
  status = "open" as Doc<"polls">["status"],
  deadlineAt = undefined as number | undefined,
  // The viewer's own row, against the Poll's two Candidate Dates. A gap
  // next to an answer is what UnansweredDatesNotice prompts about (#86).
  viewerValues = [null, null] as Answer[],
  winningCandidateDateId = undefined as Id<"candidateDates"> | undefined,
  resultingEventId = undefined as Id<"events"> | undefined,
} = {}) {
  const grid = {
    poll: {
      _id: "poll_1" as Id<"polls">,
      _creationTime: 0,
      title: "Spring Concert",
      description: "Which Saturday works?",
      location: "St Mary's",
      status,
      deadlineAt,
      winningCandidateDateId,
      resultingEventId,
      updatedAt: 0,
      createdByMemberId: "member_2" as Id<"members">,
      updatedByMemberId: undefined,
    },
    candidateDates: [
      { _id: "date_1" as Id<"candidateDates">, _creationTime: 0, pollId: "poll_1" as Id<"polls">, startsAt: MARCH_1, endsAt: undefined, displayOrder: 0 },
      { _id: "date_2" as Id<"candidateDates">, _creationTime: 0, pollId: "poll_1" as Id<"polls">, startsAt: MARCH_8, endsAt: undefined, displayOrder: 1 },
    ],
    rows: [
      { memberId: viewer._id, name: "Chris Chorister", isViewer: true, values: viewerValues },
      { memberId: "member_2" as Id<"members">, name: "Dana Director", isViewer: false, values: ["available", null] },
    ],
    tallies: [
      { available: 1, unavailable: 0, if_needed: 0, notAnswered: 1 },
      { available: 0, unavailable: 0, if_needed: 0, notAnswered: 2 },
    ],
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
      <MemoryRouter initialEntries={["/polls/poll_1"]}>
        <Routes>
          <Route path="/polls/:pollId" element={<PollDetail />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  setAvailability.mockReset();
  vi.mocked(useMutation).mockReturnValue(asMutation(setAvailability));
});

afterEach(cleanup);

describe("PollDetail", () => {
  test("records the viewer's answer for the Candidate Date they picked", () => {
    renderPoll();

    fireEvent.click(screen.getByRole("button", { name: "If needed on 2026-03-08" }));

    expect(setAvailability).toHaveBeenCalledWith({ candidateDateId: "date_2", value: "if_needed" });
  });

  test("shows an advisory deadline when the Poll carries one", () => {
    renderPoll({ deadlineAt: new Date(2026, 1, 20).getTime() });

    expect(screen.getByText(/responses by 2026-02-20/)).toBeInTheDocument();
  });

  test("prompts a viewer who answered one date but not the other", () => {
    renderPoll({ viewerValues: ["available", null] });

    expect(screen.getByRole("status")).toHaveTextContent("1 Candidate Date needs your answer: 2026-03-08");
  });

  test("leaves the prompt off a closed Poll, which nobody can answer", () => {
    renderPoll({ status: "closed", viewerValues: ["available", null] });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("renders a closed Poll read-only", () => {
    renderPoll({ status: "closed" });

    expect(screen.getByText("This Poll is closed. Closed Polls are read-only.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /on 2026-03-01/ })).not.toBeInTheDocument();
  });

  // An open Poll has no outcome to report — nothing has been settled yet
  // (#88). PollOutcome's own rendering is covered in its component test.
  test("offers no outcome while the Poll is open", () => {
    renderPoll();

    expect(screen.queryByText(/This Poll settled on/)).not.toBeInTheDocument();
    expect(screen.queryByText(/closed with no winning date/)).not.toBeInTheDocument();
  });

  test("shows a closed Poll's outcome beside its still-browsable grid", () => {
    renderPoll({
      status: "closed",
      winningCandidateDateId: "date_2" as Id<"candidateDates">,
      resultingEventId: "event_1" as Id<"events">,
    });

    expect(screen.getByText(/This Poll settled on 2026-03-08/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the Event" })).toHaveAttribute("href", "/events/event_1");
  });
});
