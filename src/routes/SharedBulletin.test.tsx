// The Share Link landing page (#83, ADR-0004). What's under test is the
// routing decision the page makes from the link's mode — render, redirect, or
// refuse — since that decision is the access model, not a detail of it.
import { cleanup, render, screen } from "@testing-library/react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { ThemeProvider } from "../design/ThemeProvider";
import { asMutation } from "../test/convexMocks";
import SharedBulletin from "./SharedBulletin";

vi.mock("@clerk/clerk-react", () => ({ useAuth: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const TOKEN = "tok_abc";

// Typed from the query's own return type, so a change to the public
// projection breaks this fixture rather than letting the test drift.
type SharedBulletinResult = NonNullable<FunctionReturnType<typeof api.public.getSharedBulletin>>;

const publishedBulletin: SharedBulletinResult = {
  title: "This week's notes",
  body: "Warm-ups at **6:45**.",
  publishedAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  event: null,
  remarks: [],
};

// Anything the route redirects to lands here, so an assertion can name the
// destination instead of inspecting router internals.
function Elsewhere() {
  const location = useLocation();
  return <p>{`elsewhere:${location.pathname}${location.search}`}</p>;
}

type QueryResults = {
  mode?: "token" | "sign_in_required" | null;
  bulletin?: SharedBulletinResult | null;
  viewer?: Doc<"members"> | null;
  resolved?: string | null;
};

function renderRoute(results: QueryResults) {
  vi.mocked(useQuery).mockImplementation(((query: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(query);
    // A "skip" second argument means the route deliberately isn't
    // subscribing yet; convex/react resolves those to undefined.
    if (args === "skip") return undefined;
    if (name === getFunctionName(api.public.getSharedBulletinMode)) return results.mode;
    if (name === getFunctionName(api.public.getSharedBulletin)) return results.bulletin;
    if (name === getFunctionName(api.members.viewer)) return results.viewer;
    if (name === getFunctionName(api.bulletinShareLinks.resolveForMember)) return results.resolved;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);

  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/s/${TOKEN}`]}>
        <Routes>
          <Route path="/s/:token" element={<SharedBulletin />} />
          <Route path="*" element={<Elsewhere />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function signedIn(isSignedIn: boolean) {
  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn } as unknown as ReturnType<typeof useAuth>);
}

beforeEach(() => {
  vi.mocked(useMutation).mockReturnValue(asMutation(vi.fn()));
  // Every test that needs Clerk sets it explicitly; this default makes an
  // accidental useAuth call on a guest path visible rather than silent.
  vi.mocked(useAuth).mockReturnValue({ isLoaded: false, isSignedIn: false } as unknown as ReturnType<
    typeof useAuth
  >);
});

afterEach(cleanup);

describe("SharedBulletin", () => {
  test("renders a token-mode Bulletin read-only", () => {
    renderRoute({ mode: "token", bulletin: publishedBulletin });

    expect(screen.getByRole("heading", { name: "This week's notes" })).toBeInTheDocument();
    expect(screen.getByText("6:45")).toBeInTheDocument();
  });

  test("says a token-mode link is read-only and forwardable", () => {
    renderRoute({ mode: "token", bulletin: publishedBulletin });

    expect(screen.getByText(/Anyone with this link can read this Bulletin/)).toBeInTheDocument();
  });

  test("renders a token-mode Bulletin without waiting on Clerk", () => {
    // The guest E2E project carries no Clerk secret, and a page that blocks
    // on Clerk's isLoaded there hung past every timeout in CI.
    renderRoute({ mode: "token", bulletin: publishedBulletin });

    expect(useAuth).not.toHaveBeenCalled();
  });

  test("shows the anchored Event's title and the Remarks with their Piece titles", () => {
    renderRoute({
      mode: "token",
      bulletin: {
        ...publishedBulletin,
        event: { title: "Thursday Rehearsal", startsAt: 1_700_000_000_000, location: "Town Hall" },
        remarks: [{ pieceTitle: "Sicut Cervus", text: "Tenors, breathe at bar 12" }],
      },
    });

    expect(screen.getByText(/Thursday Rehearsal/)).toBeInTheDocument();
    expect(screen.getByText("Sicut Cervus")).toBeInTheDocument();
    expect(screen.getByText(/Tenors, breathe at bar 12/)).toBeInTheDocument();
  });

  test("tells a holder of an unknown or revoked token that the link is dead", () => {
    renderRoute({ mode: null });

    expect(screen.getByRole("heading", { name: "This link is no longer valid" })).toBeInTheDocument();
  });

  test("does not reach the 404 route for an invalid token", () => {
    renderRoute({ mode: null });

    expect(screen.queryByText(/^elsewhere:/)).not.toBeInTheDocument();
  });

  test("renders nothing for an invalid token beyond the dead-link notice", () => {
    renderRoute({ mode: null });

    expect(screen.queryByText("This week's notes")).not.toBeInTheDocument();
  });

  test("sends an unauthenticated visitor on a sign-in link to sign-in, and back again", () => {
    signedIn(false);

    renderRoute({ mode: "sign_in_required" });

    const returnTo = encodeURIComponent(`/s/${TOKEN}`);
    expect(screen.getByText(`elsewhere:/sign-in?redirect_url=${returnTo}`)).toBeInTheDocument();
  });

  test("sends a signed-in Member on a sign-in link to the Bulletin's reading view", () => {
    signedIn(true);
    const viewer = { _id: "member_1", role: "chorister" } as unknown as Doc<"members">;

    renderRoute({ mode: "sign_in_required", viewer, resolved: "bulletin_7" });

    expect(screen.getByText("elsewhere:/bulletins/bulletin_7")).toBeInTheDocument();
  });

  test("shows a dead link to a Member whose sign-in link no longer resolves", () => {
    signedIn(true);
    const viewer = { _id: "member_1", role: "chorister" } as unknown as Doc<"members">;

    renderRoute({ mode: "sign_in_required", viewer, resolved: null });

    expect(screen.getByRole("heading", { name: "This link is no longer valid" })).toBeInTheDocument();
  });

  test("waits rather than redirecting while a first-time Member record is created", () => {
    signedIn(true);

    renderRoute({ mode: "sign_in_required", viewer: null });

    expect(screen.getByText("Setting up your account…")).toBeInTheDocument();
    expect(screen.queryByText(/^elsewhere:/)).not.toBeInTheDocument();
  });
});
