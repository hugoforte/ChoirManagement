// Renders the real MemberPage and AppShell rather than mocking them, since
// what's under test is exactly the capability gate on the Manage entry and
// the nav entry the shell renders. Deliberately kept separate from
// Bulletins.test.tsx despite the shared harness: #84 and #80 run as parallel
// workstreams, and one test file per route pair is what keeps them out of
// each other's way (see docs/architecture/bulletins-and-polls-orchestration.md).
import { cleanup, render, screen, within } from "@testing-library/react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { ThemeProvider } from "../design/ThemeProvider";
import { asMutation } from "../test/convexMocks";
import Polls from "./Polls";

vi.mock("@clerk/clerk-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/clerk-react")>();
  return {
    ...actual,
    useAuth: vi.fn(),
    // The real SignOutButton needs a live ClerkProvider; AppShell only needs
    // it to render its children.
    SignOutButton: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

type PollListItem = FunctionReturnType<typeof api.polls.listForMember>[number];

const MARCH_1 = new Date(2026, 2, 1).getTime();
const MARCH_8 = new Date(2026, 2, 8).getTime();

// Open first, then closed as history — the order polls.listForMember
// returns, which the route splits into its two sections.
const polls: PollListItem[] = [
  {
    _id: "poll_1" as Doc<"polls">["_id"],
    _creationTime: 2,
    title: "Spring Concert",
    status: "open",
    deadlineAt: MARCH_1,
    candidateDateCount: 3,
    responseState: "partial",
    outcome: null,
  },
  {
    _id: "poll_2" as Doc<"polls">["_id"],
    _creationTime: 1,
    title: "Extra rehearsal",
    status: "open",
    deadlineAt: undefined,
    candidateDateCount: 1,
    responseState: "not_started",
    outcome: null,
  },
  {
    _id: "poll_3" as Doc<"polls">["_id"],
    _creationTime: 0,
    title: "Last year's concert",
    status: "closed",
    deadlineAt: undefined,
    candidateDateCount: 2,
    responseState: "complete",
    outcome: { winningStartsAt: MARCH_8, winningEndsAt: null, resultingEventId: "event_1" as Doc<"events">["_id"] },
  },
];

function renderAs(role: Doc<"members">["role"], pollList: PollListItem[] = polls) {
  const viewer: Doc<"members"> = {
    _id: "member_1" as Doc<"members">["_id"],
    _creationTime: 0,
    clerkUserId: "issuer|subject",
    name: "Test Member",
    email: "test@example.com",
    role,
  };

  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useQuery).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.members.viewer)) return viewer;
    if (name === getFunctionName(api.choirSettings.get)) return { name: "Riverside Choir", logoUrl: null };
    if (name === getFunctionName(api.polls.listForMember)) return pollList;
    // AppShell subscribes to this for the Bulletins unread dot (#82); this
    // file renders the real shell, so it sees the call.
    if (name === getFunctionName(api.bulletins.hasUnread)) return false;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);

  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/polls"]}>
        <Polls />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function listItemFor(title: string) {
  const link = screen.getByRole("link", { name: title });
  const item = link.closest("li");
  if (!item) throw new Error(`Expected "${title}" to sit in a list item`);
  return within(item);
}

beforeEach(() => {
  vi.mocked(useMutation).mockReturnValue(asMutation(vi.fn()));
});

afterEach(cleanup);

describe("Polls", () => {
  test("offers an Admin the Manage entry", () => {
    renderAs("admin");

    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/polls/manage");
  });

  test("offers a Director the Manage entry", () => {
    renderAs("director");

    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/polls/manage");
  });

  test("hides the Manage entry from a Chorister", () => {
    renderAs("chorister");

    expect(screen.queryByRole("link", { name: "Manage" })).not.toBeInTheDocument();
  });

  test("links a Chorister from an open Poll to its availability grid", () => {
    renderAs("chorister");

    expect(screen.getByRole("link", { name: "Spring Concert" })).toHaveAttribute("href", "/polls/poll_1");
  });

  test("gives every Member a Polls entry in the primary nav", () => {
    renderAs("chorister");

    const primaryNav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primaryNav).getByRole("link", { name: "Polls" })).toHaveAttribute("href", "/polls");
  });

  test("marks a Poll the viewer has only partly answered", () => {
    renderAs("chorister");

    expect(listItemFor("Spring Concert").getByText("Partly answered")).toBeInTheDocument();
  });

  test("marks a Poll the viewer has not started", () => {
    renderAs("chorister");

    expect(listItemFor("Extra rehearsal").getByText("No answers yet")).toBeInTheDocument();
  });

  test("marks a Poll the viewer has answered in full", () => {
    renderAs("chorister");

    expect(listItemFor("Last year's concert").getByText("All answered")).toBeInTheDocument();
  });

  test("counts the Candidate Dates each Poll asks about", () => {
    renderAs("chorister");

    expect(listItemFor("Spring Concert").getByText(/3 dates/)).toBeInTheDocument();
  });

  test("keeps closed Polls under a History heading, still linked to their grid", () => {
    renderAs("chorister");

    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Last year's concert" })).toHaveAttribute("href", "/polls/poll_3");
  });

  test("shows a closed Poll's winning date and the Event it became", () => {
    renderAs("chorister");

    const item = listItemFor("Last year's concert");
    expect(item.getByText(/Settled on 2026-03-08/)).toBeInTheDocument();
    expect(item.getByRole("link", { name: "View the Event" })).toHaveAttribute("href", "/events/event_1");
  });

  test("shows a closed Poll that settled on nothing", () => {
    renderAs("chorister", [
      { ...polls[2], outcome: { winningStartsAt: null, winningEndsAt: null, resultingEventId: null } },
    ]);

    expect(listItemFor("Last year's concert").getByText("Closed with no winning date")).toBeInTheDocument();
  });

  test("omits the History heading when no Poll has closed yet", () => {
    renderAs("chorister", [polls[0]]);

    expect(screen.queryByRole("heading", { name: "History" })).not.toBeInTheDocument();
  });

  test("tells a Member when there is nothing open to answer", () => {
    renderAs("chorister", []);

    expect(screen.getByText("No open Polls.")).toBeInTheDocument();
  });
});
