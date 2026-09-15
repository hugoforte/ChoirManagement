// The reading view (#82). Renders through the real MemberPage, so the
// assertions cover what a Chorister actually lands on — including the 404 a
// draft's URL resolves to, which is the whole reason getPublished returns
// null instead of the document.
import { cleanup, render, screen, within } from "@testing-library/react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { formatTimestamp } from "../lib/datetime";
import { ThemeProvider } from "../design/ThemeProvider";
import { asMutation } from "../test/convexMocks";
import BulletinDetail from "./BulletinDetail";

vi.mock("@clerk/clerk-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/clerk-react")>();
  return {
    ...actual,
    useAuth: vi.fn(),
    SignOutButton: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const PUBLISHED_AT = 1_700_000_000_000;
const EDITED_AT = PUBLISHED_AT + 60 * 60 * 1000;

type ReadingView = {
  _id: Id<"bulletins">;
  title: string;
  body: string;
  publishedAt: number;
  updatedAt: number;
  eventId: Id<"events"> | null;
  eventTitle: string | null;
};

function bulletin(overrides: Partial<ReadingView> = {}): ReadingView {
  return {
    _id: "bulletin_1" as Id<"bulletins">,
    title: "After Tuesday's rehearsal",
    body: "Bring your Palestrina.",
    publishedAt: PUBLISHED_AT,
    updatedAt: PUBLISHED_AT,
    eventId: null,
    eventTitle: null,
    ...overrides,
  };
}

function renderDetail(result: ReadingView | null | undefined) {
  const viewer: Doc<"members"> = {
    _id: "member_1" as Doc<"members">["_id"],
    _creationTime: 0,
    clerkUserId: "issuer|subject",
    name: "Test Member",
    email: "test@example.com",
    role: "chorister",
  };

  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useQuery).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.members.viewer)) return viewer;
    if (name === getFunctionName(api.choirSettings.get)) return { name: "Riverside Choir", logoUrl: null };
    if (name === getFunctionName(api.bulletins.hasUnread)) return false;
    if (name === getFunctionName(api.bulletins.getPublished)) return result;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);

  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/bulletins/bulletin_1"]}>
        <Routes>
          <Route path="/bulletins/:bulletinId" element={<BulletinDetail />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

// MemberPage repeats the Bulletin's title in the shell header (usePageTitle),
// so every assertion about the Bulletin itself is scoped to the article
// rather than to the whole document.
function readingView() {
  return within(screen.getByRole("article"));
}

beforeEach(() => {
  vi.mocked(useMutation).mockReturnValue(asMutation(vi.fn()));
});

afterEach(cleanup);

describe("BulletinDetail", () => {
  test("shows the title and the published date", () => {
    renderDetail(bulletin());

    expect(readingView().getByRole("heading", { name: "After Tuesday's rehearsal" })).toBeInTheDocument();
    expect(readingView().getByText(`Published ${formatTimestamp(PUBLISHED_AT)}`)).toBeInTheDocument();
  });

  test("shows an edited timestamp beside the published one when it was edited", () => {
    renderDetail(bulletin({ updatedAt: EDITED_AT }));

    expect(
      readingView().getByText(`Published ${formatTimestamp(PUBLISHED_AT)} · Edited ${formatTimestamp(EDITED_AT)}`),
    ).toBeInTheDocument();
  });

  test("claims no edit when publishing was the last thing that touched it", () => {
    renderDetail(bulletin());

    expect(readingView().queryByText(/Edited/)).not.toBeInTheDocument();
  });

  test("links the anchored Event", () => {
    renderDetail(
      bulletin({ eventId: "event_1" as Id<"events">, eventTitle: "Tuesday Rehearsal" }),
    );

    expect(readingView().getByRole("link", { name: "Tuesday Rehearsal" })).toHaveAttribute("href", "/events/event_1");
  });

  test("renders the body as Markdown", () => {
    renderDetail(bulletin({ body: "## What we covered" }));

    expect(readingView().getByRole("heading", { name: "What we covered" })).toBeInTheDocument();
  });

  // getPublished answers null for a draft whoever is asking, so the reading
  // route can't tell one from a deleted Bulletin — which is the point.
  test("shows the 404 when the Bulletin isn't published", () => {
    renderDetail(null);

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
