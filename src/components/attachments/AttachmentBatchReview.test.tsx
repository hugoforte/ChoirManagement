import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { TrackedUpload } from "../../lib/batchUpload";
import { useBatchUpload, type UseBatchUploadResult } from "../../lib/useBatchUpload";
import { asMutation } from "../../test/convexMocks";
import { AttachmentBatchReview } from "./AttachmentBatchReview";

vi.mock("convex/react", () => ({ useMutation: vi.fn(), useQuery: vi.fn() }));
vi.mock("../../lib/useBatchUpload", () => ({ useBatchUpload: vi.fn() }));

const publish = vi.fn();
const register = vi.fn();
const discard = vi.fn();
const addFiles = vi.fn();
const retry = vi.fn();
const cancel = vi.fn();
const cancelAll = vi.fn();
const clearCompleted = vi.fn();

const parts = [
  { _id: "part-all" as Id<"voiceParts">, name: "All", displayOrder: 0, isAll: true },
  { _id: "part-s" as Id<"voiceParts">, name: "Soprano", displayOrder: 1, isAll: false },
  { _id: "part-t" as Id<"voiceParts">, name: "Tenor", displayOrder: 2, isAll: false },
];

let managementDetail: {
  piece: Pick<Doc<"pieces">, "_id" | "title">;
  attachments: Array<{
    attachment: Pick<Doc<"pieceAttachments">, "_id" | "filenameOverride" | "isPrimary">;
    currentVersion: Pick<Doc<"pieceFileVersions">, "originalFilename" | "sha256">;
    url: string | null;
  }>;
};
let uploadFiles: TrackedUpload[];

function trackedUpload(
  id: string,
  name: string,
  status: TrackedUpload["status"] = "succeeded",
  sha256 = "a".repeat(64),
): TrackedUpload {
  const file = new File([name], name, { type: name.endsWith(".pdf") ? "application/pdf" : "audio/mpeg" });
  return {
    id,
    file,
    status,
    progress: { loaded: status === "succeeded" ? file.size : 3, total: file.size, percent: status === "succeeded" ? 100 : 42 },
    warning: status === "uploading" ? "Large file: test warning" : null,
    attempt: 1,
    error: status === "failed" ? "Network unavailable" : null,
    uploaded: status === "succeeded"
      ? {
          fileId: id,
          storageId: `storage-${id}` as Id<"_storage">,
          originalFilename: name,
          contentType: file.type,
          size: file.size,
          sha256,
          hash: { algorithm: "SHA-256", clientSha256: sha256, serverSha256: sha256, matches: true },
        }
      : null,
  };
}

function mockUploadResult(): UseBatchUploadResult {
  return {
    files: uploadFiles,
    error: null,
    isUploading: uploadFiles.some((upload) => upload.status === "uploading"),
    isComplete: uploadFiles.every((upload) => ["succeeded", "failed", "cancelled"].includes(upload.status)),
    addFiles,
    retry,
    cancel,
    cancelAll,
    clearCompleted,
  };
}

function renderReview() {
  return render(
    <AttachmentBatchReview
      pieceId={"piece-1" as Id<"pieces">}
      title="Hallelujah"
      arranger="Handel"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  publish.mockResolvedValue(["attachment-1"]);
  register.mockResolvedValue(null);
  discard.mockResolvedValue(null);
  cancel.mockResolvedValue(undefined);
  cancelAll.mockResolvedValue(undefined);
  managementDetail = {
    piece: { _id: "piece-1" as Id<"pieces">, title: "Hallelujah" },
    attachments: [],
  };
  uploadFiles = [];
  vi.mocked(useQuery).mockImplementation(((_reference: unknown, args?: unknown) =>
    args === undefined ? parts : managementDetail) as typeof useQuery);
  vi.mocked(useMutation).mockImplementation(((reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === "pieceAttachments:publishBatch") return asMutation(publish);
    if (name === "pieceAttachments:registerPendingUpload") return asMutation(register);
    if (name === "pieceAttachments:discardUnreferencedStorage") return asMutation(discard);
    throw new Error(`Unexpected mutation ${name}`);
  }) as typeof useMutation);
  vi.mocked(useBatchUpload).mockImplementation(() => mockUploadResult());
});

afterEach(cleanup);

describe("AttachmentBatchReview", () => {
  it("reviews inferred metadata, clears an ineligible primary, and publishes a valid row", async () => {
    uploadFiles = [trackedUpload("upload-1", "Hallelujah score.pdf")];
    renderReview();

    const reviewRow = await screen.findByTestId("review-row-upload-1");
    expect(within(reviewRow).getAllByText("inferred").length).toBeGreaterThanOrEqual(3);
    expect(within(reviewRow).getByLabelText(/Primary score/)).toBeChecked();
    expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled();

    fireEvent.change(within(reviewRow).getByLabelText("Purpose for Hallelujah score.pdf"), {
      target: { value: "partScore" },
    });
    expect(within(reviewRow).getByLabelText(/Primary score/)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();
    fireEvent.click(within(reviewRow).getByLabelText("Soprano"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    });
    expect(publish).toHaveBeenCalledWith({
      pieceId: "piece-1",
      attachments: [
        expect.objectContaining({
          storageId: "storage-upload-1",
          originalFilename: "Hallelujah score.pdf",
          format: "pdf",
          purpose: "partScore",
          voicePartIds: ["part-s"],
          isPrimary: false,
        }),
      ],
    });
    const published = publish.mock.calls[0]?.[0]?.attachments[0];
    expect(published).not.toHaveProperty("filenameOverride");
    expect(clearCompleted).toHaveBeenCalledOnce();
  });

  it("publishes an explicit filename only after the reviewer overrides it", async () => {
    uploadFiles = [trackedUpload("upload-1", "Hallelujah score.pdf")];
    renderReview();

    const filename = await screen.findByLabelText(
      "Filename for Hallelujah score.pdf",
    );
    fireEvent.change(filename, { target: { value: "Committee copy.pdf" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    });

    expect(publish.mock.calls[0]?.[0]?.attachments[0]).toMatchObject({
      filenameOverride: "Committee copy.pdf",
    });
  });

  it("applies bulk purpose and voice-part edits to selected review rows", async () => {
    uploadFiles = [
      trackedUpload("upload-1", "Hallelujah score.pdf", "succeeded", "a".repeat(64)),
      trackedUpload("upload-2", "Hallelujah tenor.mp3", "succeeded", "b".repeat(64)),
    ];
    renderReview();
    const first = await screen.findByTestId("review-row-upload-1");
    const second = await screen.findByTestId("review-row-upload-2");
    fireEvent.click(within(first).getByLabelText("Select"));
    fireEvent.click(within(second).getByLabelText("Select"));

    const bulk = screen.getByLabelText("Bulk edit selected attachments");
    fireEvent.change(within(bulk).getByLabelText("Purpose"), { target: { value: "other" } });
    fireEvent.click(within(bulk).getByRole("button", { name: "Apply" }));
    expect(within(first).getByLabelText("Purpose for Hallelujah score.pdf")).toHaveValue("other");
    expect(within(second).getByLabelText("Purpose for Hallelujah tenor.mp3")).toHaveValue("other");

    fireEvent.click(within(bulk).getByLabelText("Tenor"));
    fireEvent.click(within(bulk).getByRole("button", { name: "Apply parts" }));
    expect(within(first).getByLabelText("Tenor")).toBeChecked();
    expect(within(second).getByLabelText("Tenor")).toBeChecked();
  });

  it("shows queue progress and errors and connects picker, drop, retry, and cancel", async () => {
    uploadFiles = [
      trackedUpload("uploading", "large.mp3", "uploading"),
      trackedUpload("failed", "failed.pdf", "failed"),
    ];
    renderReview();

    expect(await screen.findByText("Uploading 42%")).toBeInTheDocument();
    expect(screen.getByText("Large file: test warning")).toBeInTheDocument();
    expect(screen.getByText("Network unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledWith("failed");

    const picked = new File(["picked"], "picked.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Choose attachment files"), {
      target: { files: [picked] },
    });
    expect(addFiles).toHaveBeenCalledWith([picked]);

    const dropped = new File(["dropped"], "dropped.mscz");
    fireEvent.drop(screen.getByText("Drop files here, or").parentElement!, {
      dataTransfer: { files: [dropped] },
    });
    expect(addFiles).toHaveBeenCalledWith([dropped]);

    const failedCard = screen.getByText("failed.pdf").closest("article");
    if (!failedCard) throw new Error("Missing failed upload card");
    await act(async () => {
      fireEvent.click(within(failedCard).getByRole("button", { name: "Cancel" }));
    });
    expect(cancel).toHaveBeenCalledWith("failed");
  });

  it("renders new-version collision choice but blocks Finish while replacement is unavailable", async () => {
    uploadFiles = [trackedUpload("upload-1", "Hallelujah score.pdf")];
    managementDetail.attachments = [
      {
        attachment: {
          _id: "attachment-old" as Id<"pieceAttachments">,
          filenameOverride: "Hallelujah - Handel - Full Score.pdf",
          isPrimary: false,
        },
        currentVersion: { originalFilename: "old.pdf", sha256: "c".repeat(64) },
        url: null,
      },
    ];
    renderReview();
    const select = await screen.findByLabelText("Filename collision decision for Hallelujah score.pdf");
    fireEvent.change(select, { target: { value: "newVersion" } });

    expect(screen.getByText(/backend version replacement is not available yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();
    expect(screen.getByText(/Finish is disabled because backend version replacement/i)).toBeInTheDocument();
  });

  it("cancels and clears the whole unfinished batch", async () => {
    uploadFiles = [trackedUpload("upload-1", "Hallelujah score.pdf")];
    renderReview();
    await screen.findByTestId("review-row-upload-1");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel batch" }));
    });
    expect(cancelAll).toHaveBeenCalledOnce();
    expect(clearCompleted).toHaveBeenCalledOnce();
  });

  it("registers uploaded storage to the Piece and delegates safe cleanup", async () => {
    renderReview();
    await screen.findByRole("heading", { name: "Add attachments" });
    const options = vi.mocked(useBatchUpload).mock.calls[0]?.[1];
    const uploaded = trackedUpload("upload-1", "Hallelujah score.pdf").uploaded;
    if (!options?.registerUpload || !options.discardUnreferenced || !uploaded) {
      throw new Error("Missing batch upload callbacks");
    }

    await options.registerUpload(uploaded);
    expect(register).toHaveBeenCalledWith({
      pieceId: "piece-1",
      storageId: "storage-upload-1",
    });

    await options.discardUnreferenced(["storage-upload-1" as Id<"_storage">]);
    expect(discard).toHaveBeenCalledWith({ storageIds: ["storage-upload-1"] });
  });
});
