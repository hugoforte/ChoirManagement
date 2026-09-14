import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberPage } from "./MemberPage";
import { ThemeProvider } from "./ThemeProvider";
import { asMutation } from "../test/convexMocks";

// The exact three-way state machine AGENTS.md says "caused a real
// white-screen crash once" (see #27) — nothing reached it through a
// browser before this, so these assert the gate itself, not a route.
vi.mock("@clerk/clerk-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/clerk-react")>();
  return {
    ...actual,
    useAuth: vi.fn(),
    // Real SignOutButton needs a live ClerkProvider; AppShell only needs it
    // to render its children.
    SignOutButton: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

function viewer(role: Doc<"members">["role"]): Doc<"members"> {
  return {
    _id: "member_1" as Doc<"members">["_id"],
    _creationTime: 0,
    clerkUserId: "issuer|subject",
    name: "Test Member",
    email: "test@example.com",
    role,
  };
}

function mockQueries({
  viewer: viewerValue,
  choirSettings = { name: "Riverside Choir", logoUrl: null },
}: {
  viewer: Doc<"members"> | null | undefined;
  choirSettings?: { name: string; logoUrl: string | null } | null;
}) {
  vi.mocked(useQuery).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.members.viewer)) return viewerValue;
    if (name === getFunctionName(api.choirSettings.get)) return choirSettings;
    // AppShell subscribes to this for the Bulletins unread dot (#82), and
    // only ever renders once viewer is a real Member — which is the gate
    // these tests are about.
    if (name === getFunctionName(api.bulletins.hasUnread)) return false;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);
}

function renderMemberPage(children: (v: Doc<"members">) => React.ReactNode, require?: "manageSettings") {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route
            path="/protected"
            element={
              <MemberPage title="Test Page" require={require}>
                {children}
              </MemberPage>
            }
          />
          <Route path="/public/events" element={<p>redirected to public events</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.mocked(useMutation).mockReturnValue(asMutation(vi.fn()));
});

describe("MemberPage", () => {
  test("redirects to /public/events when signed out", () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false } as unknown as ReturnType<typeof useAuth>);
    mockQueries({ viewer: null });

    renderMemberPage(() => <p>secret content</p>);

    expect(screen.getByText("redirected to public events")).toBeInTheDocument();
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  test("shows a loading state before Clerk resolves", () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: false, isSignedIn: false } as unknown as ReturnType<typeof useAuth>);
    mockQueries({ viewer: undefined });

    const { container } = renderMemberPage(() => <p>secret content</p>);

    expect(container).toBeEmptyDOMElement();
  });

  test("shows a setup interstitial when signed in but the Member row hasn't synced yet", () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>);
    mockQueries({ viewer: null });

    renderMemberPage(() => <p>secret content</p>);

    expect(screen.getByText("Setting up your account…")).toBeInTheDocument();
  });

  test("renders the denial screen when the viewer lacks the required Capability", () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>);
    mockQueries({ viewer: viewer("chorister") });

    renderMemberPage(() => <p>secret content</p>, "manageSettings");

    expect(screen.getByText("You don't have access to this page.")).toBeInTheDocument();
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  test("renders children with the resolved viewer when the Capability check passes", () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>);
    mockQueries({ viewer: viewer("admin") });

    renderMemberPage((v) => <p>Hello, {v.name}</p>, "manageSettings");

    expect(screen.getByText("Hello, Test Member")).toBeInTheDocument();
  });
});
