// useTrackedMutation deliberately swallows a rejection and returns
// undefined rather than throwing (see src/lib/useTrackedMutation.ts), which
// makes "did this write succeed?" easy to get wrong at a call site. These
// tests pin the add form to that contract in both directions.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { asMutation } from "../../test/convexMocks";
import { RemarksEditor } from "./RemarksEditor";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const bulletinId = "bulletin_1" as Id<"bulletins">;
const pieceId = "piece_1" as Id<"pieces">;

let addMock: ReturnType<typeof vi.fn>;
let otherMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  addMock = vi.fn().mockResolvedValue("remark_1");
  otherMock = vi.fn().mockResolvedValue(null);

  vi.mocked(useQuery).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.bulletinRemarks.listForBulletin)) return [];
    if (name === getFunctionName(api.pieces.list)) return [{ _id: pieceId, title: "Sicut Cervus" }];
    // Passed "skip" while the Bulletin has no Event anchor.
    if (name === getFunctionName(api.events.get)) return undefined;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);

  vi.mocked(useMutation).mockImplementation(((mutation: Parameters<typeof getFunctionName>[0]) =>
    asMutation(
      getFunctionName(mutation) === getFunctionName(api.bulletinRemarks.add) ? addMock : otherMock,
    )) as typeof useMutation);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function typeARemark() {
  fireEvent.change(screen.getByLabelText("Piece"), { target: { value: pieceId } });
  fireEvent.change(screen.getByLabelText("Remark"), { target: { value: "Watch the cutoff at bar 48." } });
  fireEvent.click(screen.getByRole("button", { name: "Add Remark" }));
}

test("a failed add keeps the typed text", async () => {
  addMock.mockRejectedValue(new Error("Requires capability: manageBulletins"));
  render(<RemarksEditor bulletinId={bulletinId} eventId={undefined} />);

  typeARemark();

  expect(await screen.findByText("Requires capability: manageBulletins")).toBeInTheDocument();
  // The Remark is gone from the backend's point of view, so the form is the
  // only place it still exists — clearing it would destroy it for good.
  expect(screen.getByLabelText("Remark")).toHaveValue("Watch the cutoff at bar 48.");
  expect(screen.getByLabelText("Piece")).toHaveValue(pieceId);
});

test("a successful add clears the form for the next Remark", async () => {
  render(<RemarksEditor bulletinId={bulletinId} eventId={undefined} />);

  typeARemark();

  await waitFor(() => expect(screen.getByLabelText("Remark")).toHaveValue(""));
  expect(screen.getByLabelText("Piece")).toHaveValue("");
  expect(addMock).toHaveBeenCalledWith({
    bulletinId,
    pieceId,
    text: "Watch the cutoff at bar 48.",
  });
});
