// Renders the real MemberPage and AppShell rather than mocking them, since
// what's under test is exactly the capability gate on the Manage entry, the
// nav entry the shell renders, and the unread dot the shell puts on it.
// Deliberately kept separate from Polls.test.tsx despite the shared harness:
// #80 and #84 run as parallel workstreams, and one test file per route pair
// is what keeps them out of each other's way (see
// docs/architecture/bulletins-and-polls-orchestration.md).
import { cleanup, render, screen, within } from "@testing-library/react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { formatTimestamp } from "../lib/datetime";
import { ThemeProvider } from "../design/ThemeProvider";
import { asMutation } from "../test/convexMocks";
import Bulletins from "./Bulletins";

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

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

type ArchiveRow = {
  _id: Id<"bulletins">;
  title: string;
  publishedAt: number;
  updatedAt: number;
  eventId: Id<"events"> | null;
  eventTitle: string | null;
};

function archiveRow(id: string, title: string, overrides: Partial<ArchiveRow> = {}): ArchiveRow {
  return {
    _id: id as Id<"bulletins">,
    title,
    publishedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    eventId: null,
    eventTitle: null,
    ...overrides,
  };
}

// MemberPage subscribes to ensureCurrentMember and the route to
// markBulletinsRead, both through the same mocked useMutation — so each
// function gets its own spy, keyed by name, and the same reference on every
// render (an unstable one would re-fire the mount effect under test).
const mutationSpies = new Map<string, Mock>();

function spyFor(reference: Parameters<typeof getFunctionName>[0]): Mock {
  const name = getFunctionName(reference);
  const existing = mutationSpies.get(name);
  if (existing) return existing;
  const created = vi.fn();
  mutationSpies.set(name, created);
  return created;
}

function renderAs(
  role: Doc<"members">["role"],
  archive: {
    results?: ArchiveRow[];
    status?: string;
    loadMore?: Mock;
    hasUnread?: boolean;
    emailConfigured?: boolean;
  } = {},
) {
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
    if (name === getFunctionName(api.bulletins.hasUnread)) return archive.hasUnread ?? false;
    // The per-Member email opt-out hides itself unless a mail provider is
    // configured (#52); these tests are about the archive, not the toggle.
    if (name === getFunctionName(api.bulletinEmails.isConfigured)) return archive.emailConfigured ?? false;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);
  vi.mocked(usePaginatedQuery).mockReturnValue({
    results: archive.results ?? [],
    status: archive.status ?? "Exhausted",
    loadMore: archive.loadMore ?? vi.fn(),
    isLoading: false,
  } as unknown as ReturnType<typeof usePaginatedQuery>);

  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/bulletins"]}>
        <Bulletins />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mutationSpies.clear();
  vi.mocked(useMutation).mockImplementation(((reference: Parameters<typeof getFunctionName>[0]) =>
    asMutation(spyFor(reference))) as unknown as typeof useMutation);
});

afterEach(cleanup);

describe("Bulletins", () => {
  test("offers an Admin the Manage entry", () => {
    renderAs("admin");

    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/bulletins/manage");
  });

  test("offers a Director the Manage entry", () => {
    renderAs("director");

    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/bulletins/manage");
  });

  test("hides the Manage entry from a Chorister", () => {
    renderAs("chorister");

    expect(screen.queryByRole("link", { name: "Manage" })).not.toBeInTheDocument();
  });

  test("gives every Member a Bulletins entry in the primary nav", () => {
    renderAs("chorister");

    const primaryNav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primaryNav).getByRole("link", { name: "Bulletins" })).toHaveAttribute("href", "/bulletins");
  });

  test("links each published Bulletin to its reading view", () => {
    renderAs("chorister", { results: [archiveRow("bulletin_1", "After Tuesday's rehearsal")] });

    expect(screen.getByRole("link", { name: "After Tuesday's rehearsal" })).toHaveAttribute(
      "href",
      "/bulletins/bulletin_1",
    );
  });

  test("shows each Bulletin's published date and anchored Event", () => {
    renderAs("chorister", {
      results: [
        archiveRow("bulletin_1", "Anchored", { publishedAt: 1_700_000_000_000, eventTitle: "Tuesday Rehearsal" }),
      ],
    });

    expect(
      screen.getByText(`${formatTimestamp(1_700_000_000_000)} · Tuesday Rehearsal`),
    ).toBeInTheDocument();
  });

  test("says so when nothing has been published", () => {
    renderAs("chorister");

    expect(screen.getByText("No Bulletins yet.")).toBeInTheDocument();
  });

  test("marks Bulletins read once on mount", () => {
    renderAs("chorister", { results: [archiveRow("bulletin_1", "Anything")] });

    const markRead = spyFor(api.bulletins.markBulletinsRead);
    expect(markRead).toHaveBeenCalledTimes(1);
    // No timestamp from the client: the mutation reads the clock server-side,
    // where the publishedAt it gets compared against was stamped.
    expect(markRead).toHaveBeenCalledWith({});
  });

  test("offers no Load more once the archive is exhausted", () => {
    renderAs("chorister", { results: [archiveRow("bulletin_1", "Anything")], status: "Exhausted" });

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  test("asks for another page on Load more", async () => {
    const loadMore = vi.fn();
    renderAs("chorister", { results: [archiveRow("bulletin_1", "Anything")], status: "CanLoadMore", loadMore });

    screen.getByRole("button", { name: "Load more" }).click();

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  test("marks the Bulletins nav entry when something is unread", () => {
    renderAs("chorister", { hasUnread: true });

    const primaryNav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primaryNav).getByRole("status", { name: "Unread Bulletins" })).toBeInTheDocument();
  });

  test("leaves the nav unmarked when nothing is unread", () => {
    renderAs("chorister", { hasUnread: false });

    expect(screen.queryByRole("status", { name: "Unread Bulletins" })).not.toBeInTheDocument();
  });
});
