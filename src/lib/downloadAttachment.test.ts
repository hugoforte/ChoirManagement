import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadAttachment } from "./downloadAttachment";

describe("downloadAttachment", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let windowOpen: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:mock-object-url");
    revokeObjectURL = vi.fn();
    windowOpen = vi.fn();
    clickSpy = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    vi.spyOn(window, "open").mockImplementation(windowOpen);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches the URL and triggers a same-origin Blob download under the standardized filename", async () => {
    const blob = new Blob(["file contents"], { type: "application/pdf" });
    const response = { ok: true, blob: () => Promise.resolve(blob) } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await downloadAttachment("https://files.example/storage-uuid", "Full Score.pdf");

    expect(fetch).toHaveBeenCalledWith("https://files.example/storage-uuid");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-object-url");
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("falls back to opening the URL directly when the fetch response is not ok", async () => {
    const response = { ok: false, status: 403 } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await downloadAttachment("https://files.example/storage-uuid", "Full Score.pdf");

    expect(windowOpen).toHaveBeenCalledWith(
      "https://files.example/storage-uuid",
      "_blank",
      "noopener",
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("falls back to opening the URL directly when the fetch itself rejects (e.g. CORS)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await downloadAttachment("https://files.example/storage-uuid", "Full Score.pdf");

    expect(windowOpen).toHaveBeenCalledWith(
      "https://files.example/storage-uuid",
      "_blank",
      "noopener",
    );
  });
});
