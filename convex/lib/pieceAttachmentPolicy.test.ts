import { describe, expect, test } from "vitest";

import {
  isPrimaryScoreEligible,
  isPurposeAllowedForFormat,
  purposeRequiresVoicePart,
  requireCurrentRevisionBelongsToAttachment,
  requirePrimaryScoreEligible,
  requirePurposeAllowedForFormat,
  requireValidVoicePartSelection,
} from "./pieceAttachmentPolicy";

describe("Piece attachment format and purpose policy", () => {
  test("allows only the agreed purposes for each format", () => {
    expect(isPurposeAllowedForFormat("pdf", "fullScore")).toBe(true);
    expect(isPurposeAllowedForFormat("pdf", "pronunciation")).toBe(true);
    expect(isPurposeAllowedForFormat("audio", "partRehearsal")).toBe(true);
    expect(isPurposeAllowedForFormat("musicxml", "editableFullScore")).toBe(
      true,
    );

    expect(isPurposeAllowedForFormat("pdf", "partRehearsal")).toBe(false);
    expect(isPurposeAllowedForFormat("audio", "fullScore")).toBe(false);
    expect(() =>
      requirePurposeAllowedForFormat("musescore", "lyricsText"),
    ).toThrow(/not allowed for format/);
  });

  test("identifies purposes that require a voice part", () => {
    expect(purposeRequiresVoicePart("partScore")).toBe(true);
    expect(purposeRequiresVoicePart("editablePartScore")).toBe(true);
    expect(purposeRequiresVoicePart("partRehearsal")).toBe(true);
    expect(purposeRequiresVoicePart("pronunciation")).toBe(false);
  });
});

describe("Piece attachment voice-part policy", () => {
  const soprano = { id: "soprano", isAll: false };
  const alto = { id: "alto", isAll: false };
  const all = { id: "all", isAll: true };

  test("allows one or several individual parts and All by itself", () => {
    expect(() =>
      requireValidVoicePartSelection("partRehearsal", [soprano]),
    ).not.toThrow();
    expect(() =>
      requireValidVoicePartSelection("partRehearsal", [soprano, alto]),
    ).not.toThrow();
    expect(() =>
      requireValidVoicePartSelection("partRehearsal", [all]),
    ).not.toThrow();
    expect(() => requireValidVoicePartSelection("fullScore", [])).not.toThrow();
  });

  test("rejects duplicates, All mixed with another part, and missing required parts", () => {
    expect(() =>
      requireValidVoicePartSelection("partRehearsal", [soprano, soprano]),
    ).toThrow(/duplicates/);
    expect(() =>
      requireValidVoicePartSelection("partRehearsal", [all, alto]),
    ).toThrow(/cannot be combined/);
    expect(() => requireValidVoicePartSelection("partScore", [])).toThrow(
      /requires at least one/,
    );
  });
});

describe("Piece attachment primary and revision policy", () => {
  test("only a full-score PDF is primary-eligible", () => {
    expect(isPrimaryScoreEligible("pdf", "fullScore")).toBe(true);
    expect(isPrimaryScoreEligible("image", "fullScore")).toBe(false);
    expect(isPrimaryScoreEligible("pdf", "partScore")).toBe(false);
    expect(() =>
      requirePrimaryScoreEligible("musescore", "editableFullScore"),
    ).toThrow(/full-score PDF/);
  });

  test("requires the current revision to belong to its attachment", () => {
    expect(() =>
      requireCurrentRevisionBelongsToAttachment("attachment-1", {
        attachmentId: "attachment-1",
      }),
    ).not.toThrow();
    expect(() =>
      requireCurrentRevisionBelongsToAttachment("attachment-1", null),
    ).toThrow(/no current revision/);
    expect(() =>
      requireCurrentRevisionBelongsToAttachment("attachment-1", {
        attachmentId: "attachment-2",
      }),
    ).toThrow(/another attachment/);
  });
});
