import { describe, expect, it } from "vitest";

import { editedAt } from "./bulletin";

describe("editedAt", () => {
  it("is null for a draft, which has no published date to be edited after", () => {
    expect(editedAt({ updatedAt: 500 })).toBeNull();
  });

  it("is null immediately after publishing, when both timestamps are the same instant", () => {
    expect(editedAt({ publishedAt: 500, updatedAt: 500 })).toBeNull();
  });

  it("is the update time once a published Bulletin is edited", () => {
    expect(editedAt({ publishedAt: 500, updatedAt: 900 })).toBe(900);
  });
});
