import { act, renderHook } from "@testing-library/react";
import { useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asMutation } from "../test/convexMocks";
import type { StorageId, UploadTransport, UploadTransportOptions } from "./batchUpload";
import { useBatchUpload } from "./useBatchUpload";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));

// calculateSha256 (invoked by the manager before every upload) needs
// SubtleCrypto; see batchUpload.test.ts for why jsdom's global can't be
// relied on in CI.
beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

const fakeGenerateUploadUrl = {} as FunctionReference<"mutation", "public", Record<string, never>, string>;

/** A transport whose upload() never settles on its own — tests settle it explicitly. */
class DeferredTransport implements UploadTransport {
  readonly calls: string[] = [];
  private readonly pending = new Map<string, (value: { storageId: StorageId }) => void>();

  upload(file: File, options: UploadTransportOptions): Promise<{ storageId: StorageId }> {
    this.calls.push(file.name);
    return new Promise((resolve) => {
      this.pending.set(file.name, resolve);
      options.signal.addEventListener("abort", () => this.pending.delete(file.name), { once: true });
    });
  }

  resolve(name: string): void {
    const resolveUpload = this.pending.get(name);
    if (!resolveUpload) throw new Error(`No pending upload named ${name}`);
    this.pending.delete(name);
    resolveUpload({ storageId: `storage-${name}` as StorageId });
  }
}

function file(name: string): File {
  const testFile = new File(["hello"], name, { type: "application/octet-stream" });
  Object.defineProperty(testFile, "arrayBuffer", {
    configurable: true,
    value: async () => new TextEncoder().encode("hello").buffer,
  });
  return testFile;
}

describe("useBatchUpload", () => {
  it("surfaces queued/uploading state through the hook when a file is added", async () => {
    vi.mocked(useMutation).mockReturnValue(asMutation(vi.fn()));
    const transport = new DeferredTransport();
    const { result } = renderHook(() => useBatchUpload(fakeGenerateUploadUrl, { transport }));

    act(() => {
      result.current.addFiles([file("one.txt")]);
    });

    expect(result.current.files).toHaveLength(1);
    expect(["queued", "uploading"]).toContain(result.current.files[0].status);

    // Status flips to "uploading" before the transport is actually called
    // (hashing happens in between), so wait on the transport call itself.
    await vi.waitFor(() => expect(transport.calls).toEqual(["one.txt"]));
    expect(result.current.files[0].status).toBe("uploading");

    await act(async () => {
      transport.resolve("one.txt");
      await vi.waitFor(() => expect(result.current.files[0].status).toBe("succeeded"));
    });
  });

  // This is the exact failure this fix addresses (see PR #75 review): the
  // manager used to be built with useMemo keyed on options/transport, so a
  // fresh inline options object on rerender silently swapped in a brand new
  // manager and orphaned whatever the old one was uploading. A recreated
  // manager starts empty, so `files` losing the in-flight entry below would
  // mean the identity wasn't preserved.
  it("keeps the same manager (and its in-flight uploads) across a rerender with a new inline options object", async () => {
    vi.mocked(useMutation).mockReturnValue(asMutation(vi.fn()));
    const transport = new DeferredTransport();
    const { result, rerender } = renderHook(
      (_props: { label: string }) => useBatchUpload(fakeGenerateUploadUrl, { transport, maxConcurrent: 2 }),
      { initialProps: { label: "first" } },
    );

    act(() => {
      result.current.addFiles([file("in-flight.txt")]);
    });
    await vi.waitFor(() => expect(transport.calls).toEqual(["in-flight.txt"]));

    // A new options object identity every render, same as a caller passing
    // an inline `{}`/object literal instead of a memoized one.
    rerender({ label: "second" });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].status).toBe("uploading");
    expect(transport.calls).toEqual(["in-flight.txt"]); // no second upload() call from a replacement manager

    await act(async () => {
      transport.resolve("in-flight.txt");
      await vi.waitFor(() => expect(result.current.files[0].status).toBe("succeeded"));
    });
  });
});
