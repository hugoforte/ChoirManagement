import { cleanup, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { EmailDeliveryPanel } from "./EmailDeliveryPanel";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const bulletinId = "bulletin_1" as Id<"bulletins">;

type Summary = {
  queued: number;
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
  truncated: boolean;
  problems: { memberName: string; status: "bounced" | "failed"; error: string | null }[];
};

const NONE: Summary = {
  queued: 0,
  sent: 0,
  delivered: 0,
  bounced: 0,
  failed: 0,
  truncated: false,
  problems: [],
};

function renderPanel(summary: Summary | undefined) {
  vi.mocked(useQuery).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.bulletinEmails.summaryForBulletin)) return summary;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);

  return render(<EmailDeliveryPanel bulletinId={bulletinId} />);
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

test("a Bulletin nobody was emailed about says so", () => {
  renderPanel(NONE);
  expect(screen.getByText("This Bulletin wasn't emailed.")).toBeVisible();
});

test("counts appear for the statuses that have rows", () => {
  renderPanel({ ...NONE, delivered: 11, bounced: 1, problems: [] });

  expect(screen.getByText("Delivered")).toBeVisible();
  expect(screen.getByText("11")).toBeVisible();
  // Nothing was queued or failed, so those labels stay out of the way.
  expect(screen.queryByText("Queued")).toBeNull();
  expect(screen.queryByText("Failed")).toBeNull();
});

// The reason the panel exists: #52 asks for failures to be visible to the
// Director, who cannot read deployment logs.
test("a bounced recipient is named alongside the provider's reason", () => {
  renderPanel({
    ...NONE,
    delivered: 1,
    bounced: 1,
    problems: [
      { memberName: "Chris Chorister", status: "bounced", error: "Mailbox does not exist" },
    ],
  });

  expect(screen.getByText(/Chris Chorister — bounced: Mailbox does not exist/)).toBeVisible();
});

test("a failure with no provider text still names the Member", () => {
  renderPanel({
    ...NONE,
    failed: 1,
    problems: [{ memberName: "Dana Director", status: "failed", error: null }],
  });

  expect(screen.getByText("Dana Director — failed")).toBeVisible();
});

// "Sent" would read as "it arrived"; the provider has only accepted it.
test("an accepted-but-unconfirmed email is not called sent", () => {
  renderPanel({ ...NONE, sent: 3 });

  expect(screen.getByText("Handed to provider")).toBeVisible();
  expect(screen.queryByText("Sent")).toBeNull();
});

test("a truncated summary says the counts are partial", () => {
  renderPanel({ ...NONE, delivered: 500, truncated: true });

  expect(screen.getByText(/counts below are a partial view/)).toBeVisible();
});

test("the panel shows a loading state before the summary arrives", () => {
  renderPanel(undefined);
  expect(screen.getByText("Loading…")).toBeVisible();
});
