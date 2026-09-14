// Renders the real MemberPage and AppShell rather than mocking them, since
// what's under test is exactly the capability gate on the Manage entry and
// the nav entry the shell renders. Deliberately kept separate from
// Bulletins.test.tsx despite the shared harness: #84 and #80 run as parallel
// workstreams, and one test file per route pair is what keeps them out of
// each other's way (see docs/architecture/bulletins-and-polls-orchestration.md).
import { cleanup, render, screen, within } from "@testing-library/react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
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

function renderAs(role: Doc<"members">["role"]) {
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

  test("gives every Member a Polls entry in the primary nav", () => {
    renderAs("chorister");

    const primaryNav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primaryNav).getByRole("link", { name: "Polls" })).toHaveAttribute("href", "/polls");
  });
});
