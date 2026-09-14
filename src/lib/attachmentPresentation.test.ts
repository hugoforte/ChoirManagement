import { describe, expect, it } from "vitest";

import {
  attachmentPreview,
  availableAttachmentPartFilters,
  createAttachmentPresentation,
  filterAttachmentsForPart,
  previewKindForFormat,
  standardizedAttachmentName,
  type PresentationAttachmentInput,
  type PresentationPart,
} from "./attachmentPresentation";

const all: PresentationPart = { id: "all", name: "All", displayOrder: 0, isAll: true };
const soprano: PresentationPart = {
  id: "soprano",
  name: "Soprano",
  displayOrder: 1,
  isAll: false,
};
const alto: PresentationPart = { id: "alto", name: "Alto", displayOrder: 2, isAll: false };
const tenor: PresentationPart = { id: "tenor", name: "Tenor", displayOrder: 3, isAll: false };
const bass: PresentationPart = { id: "bass", name: "Bass", displayOrder: 4, isAll: false };

const piece = {
  title: "Ode to Joy",
  composer: "L. van Beethoven",
  arranger: "Jane Arranger",
};

function attachment(
  id: string,
  purpose: PresentationAttachmentInput["purpose"],
  options: Partial<PresentationAttachmentInput> = {},
): PresentationAttachmentInput {
  return {
    id,
    format: purpose.startsWith("editable") ? "musescore" : "pdf",
    purpose,
    parts: [],
    manualOrder: 0,
    isPrimary: false,
    originalExtension: "pdf",
    url: `https://files.test/${id}`,
    updatedAt: 1_700_000_000_000,
    ...options,
  };
}

describe("attachment presentation", () => {
  it("generates the standardized display and download name when there is no override", () => {
    const input = attachment("score", "fullScore", {
      parts: [alto, soprano],
      originalExtension: ".PDF",
    });

    expect(standardizedAttachmentName(piece, input)).toBe(
      "Ode-to-Joy - Jane-Arranger - Full Score - Soprano-Alto.pdf",
    );
    const model = createAttachmentPresentation({ piece, attachments: [input] });
    const presented = model.groups[0].attachments[0];
    expect(presented.displayName).toBe(presented.downloadName);
    expect(presented.download.filename).toBe(presented.downloadName);
    expect(presented.label).toBe("Full Score · Soprano + Alto");
  });

  it("uses a non-empty filename override for both display and download, and strips its extension for the label", () => {
    const input = attachment("score", "fullScore", {
      filenameOverride: "Concert score.pdf",
    });

    const model = createAttachmentPresentation({ piece, attachments: [input] });
    const presented = model.groups[0].attachments[0];
    expect(presented.displayName).toBe("Concert score.pdf");
    expect(presented.downloadName).toBe("Concert score.pdf");
    expect(presented.label).toBe("Concert score");
  });

  it("labels a purpose without parts using only the purpose label", () => {
    const input = attachment("score", "fullScore");

    const model = createAttachmentPresentation({ piece, attachments: [input] });
    expect(model.groups[0].attachments[0].label).toBe("Full Score");
  });

  it("isolates the primary attachment into an explicit main-score action", () => {
    const primary = attachment("main", "fullScore", {
      isPrimary: true,
      manualOrder: 20,
    });
    const additional = attachment("extra", "fullScore", { manualOrder: 1 });

    const model = createAttachmentPresentation({
      piece,
      attachments: [primary, additional],
    });

    expect(model.primaryAction).toMatchObject({
      kind: "openMainScore",
      label: "Open main score",
      attachment: { id: "main", isPrimary: true },
    });
    expect(model.groups.flatMap((group) => group.attachments).map((file) => file.id)).toEqual([
      "extra",
    ]);
  });

  it("returns no primary action and no groups for a Piece without files", () => {
    const model = createAttachmentPresentation({ piece, attachments: [] });
    expect(model.primaryAction).toBeNull();
    expect(model.groups).toEqual([]);
    expect(model.availablePartFilters).toEqual([]);
  });

  it("orders groups and orders ordinary group members by manual order", () => {
    const files = [
      attachment("other", "other", { manualOrder: 3, format: "other", originalExtension: "txt" }),
      attachment("reference", "referencePerformance", { format: "audio", originalExtension: "mp3", manualOrder: 2 }),
      attachment("text", "lyricsText", { manualOrder: 4 }),
      attachment("score", "fullScore", { manualOrder: 1 }),
    ];

    const model = createAttachmentPresentation({ piece, attachments: files });
    expect(model.groups.map((group) => group.key)).toEqual([
      "scoresText",
      "accompanimentReference",
      "editableOther",
    ]);
    expect(model.groups[0].attachments.map((file) => file.id)).toEqual(["score", "text"]);
    expect(model.groups[1].attachments.map((file) => file.id)).toEqual(["reference"]);
    expect(model.groups[2].attachments.map((file) => file.id)).toEqual(["other"]);
  });

  it("orders rehearsal sections All first, then configured parts, with manual order inside each section", () => {
    const files = [
      attachment("alto-late", "partRehearsal", {
        format: "audio",
        originalExtension: "mp3",
        parts: [alto],
        manualOrder: 2,
      }),
      attachment("all", "partRehearsal", {
        format: "audio",
        originalExtension: "mp3",
        parts: [all],
        manualOrder: 99,
      }),
      attachment("alto-first", "partRehearsal", {
        format: "audio",
        originalExtension: "mp3",
        parts: [alto],
        manualOrder: 1,
      }),
      attachment("soprano", "partRehearsal", {
        format: "audio",
        originalExtension: "mp3",
        parts: [soprano],
        manualOrder: 50,
      }),
    ];

    const rehearsal = createAttachmentPresentation({ piece, attachments: files }).groups[0];
    expect(rehearsal.key).toBe("rehearsal");
    expect(rehearsal.partSections?.map((section) => section.label)).toEqual([
      "All",
      "Soprano",
      "Alto",
    ]);
    expect(rehearsal.partSections?.map((section) => section.attachments.map((file) => file.id))).toEqual([
      ["all"],
      ["soprano"],
      ["alto-first", "alto-late"],
    ]);
    expect(rehearsal.attachments.map((file) => file.id)).toEqual([
      "all",
      "soprano",
      "alto-first",
      "alto-late",
    ]);
  });

  it("shows a multi-part attachment once with parts in configured order", () => {
    const multiPart = attachment("multi", "partRehearsal", {
      format: "audio",
      originalExtension: "mp3",
      parts: [bass, soprano, tenor],
    });

    const model = createAttachmentPresentation({ piece, attachments: [multiPart] });
    const rehearsal = model.groups[0];
    expect(rehearsal.attachments).toHaveLength(1);
    expect(rehearsal.attachments[0].partLabel).toBe("Soprano + Tenor + Bass");
    expect(rehearsal.partSections?.map((section) => section.label)).toEqual(["Soprano"]);
  });

  it("exposes only assigned individual parts as filters in configured order", () => {
    const files = [
      attachment("bass", "partRehearsal", { parts: [bass] }),
      attachment("all", "partRehearsal", { parts: [all] }),
      attachment("multi", "partRehearsal", { parts: [tenor, soprano] }),
    ];
    expect(availableAttachmentPartFilters(files)).toEqual([
      { id: "soprano", name: "Soprano" },
      { id: "tenor", name: "Tenor" },
      { id: "bass", name: "Bass" },
    ]);
  });

  it("retains the selected part, All, and unassigned score/document files during filtering", () => {
    const files = [
      attachment("soprano", "partRehearsal", { parts: [soprano] }),
      attachment("alto", "partRehearsal", { parts: [alto] }),
      attachment("all", "partRehearsal", { parts: [all] }),
      attachment("general-score", "fullScore", { parts: [] }),
      attachment("general-text", "lyricsText", { parts: [], format: "other", originalExtension: "txt" }),
      attachment("unassigned-audio", "fullMix", { parts: [], format: "audio", originalExtension: "mp3" }),
      attachment("editable-source", "editableFullScore", { parts: [], format: "musescore", originalExtension: "mscz" }),
    ];

    expect(filterAttachmentsForPart(files, "soprano").map((file) => file.id)).toEqual([
      "soprano",
      "all",
      "general-score",
      "general-text",
      "unassigned-audio",
      "editable-source",
    ]);
    const model = createAttachmentPresentation({
      piece,
      attachments: files,
      selectedPartId: "soprano",
    });
    expect(model.selectedPartId).toBe("soprano");
    expect(model.groups.flatMap((group) => group.attachments).map((file) => file.id)).not.toContain("alto");
  });

  it("models inline preview kinds and download-only formats", () => {
    expect(previewKindForFormat("pdf")).toBe("pdf");
    expect(previewKindForFormat("audio")).toBe("audio");
    expect(previewKindForFormat("image")).toBe("image");
    expect(previewKindForFormat("musescore")).toBe("download");
    expect(attachmentPreview("pdf", " https://files.test/score ")).toEqual({
      kind: "pdf",
      url: "https://files.test/score",
      available: true,
    });
    expect(attachmentPreview("musescore", "https://files.test/source")).toEqual({
      kind: "download",
      url: "https://files.test/source",
      available: true,
    });
  });

  it("marks a missing URL unavailable without changing the format-based preview kind", () => {
    const files = [
      attachment("pdf", "fullScore", { url: null }),
      attachment("audio", "fullMix", { format: "audio", originalExtension: "mp3", url: "" }),
      attachment("image", "other", { format: "image", originalExtension: "png", url: undefined }),
    ];
    const model = createAttachmentPresentation({ piece, attachments: files });
    const presented = model.groups.flatMap((group) => group.attachments);
    expect(presented.map((file) => file.preview)).toEqual([
      { kind: "pdf", url: null, available: false, unavailableReason: "missing-url" },
      { kind: "audio", url: null, available: false, unavailableReason: "missing-url" },
      { kind: "image", url: null, available: false, unavailableReason: "missing-url" },
    ]);
    expect(presented.every((file) => !file.download.available)).toBe(true);
  });

  it("carries optional audio duration and updated timestamp through the read model", () => {
    const file = attachment("audio", "partRehearsal", {
      format: "audio",
      originalExtension: "mp3",
      parts: [tenor],
      durationSeconds: 93.5,
      updatedAt: 1_800_000_000_000,
    });

    const presented = createAttachmentPresentation({ piece, attachments: [file] }).groups[0].attachments[0];
    expect(presented.durationSeconds).toBe(93.5);
    expect(presented.updatedAt).toBe(1_800_000_000_000);
  });
});
