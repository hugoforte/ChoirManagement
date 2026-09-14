import { waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BatchUploadManager,
  calculateSha256,
  DEFAULT_LARGE_FILE_WARNING_BYTES,
  MAX_DISCARD_BATCH_SIZE,
  type StorageId,
  type UploadTransport,
  type UploadTransportOptions,
} from "./batchUpload";

beforeAll(() => {
  // Node 20's jsdom global may expose Crypto without SubtleCrypto in CI.
  // Production browsers provide this API; use Node's implementation here so
  // the tests exercise the real hashing path deterministically.
  vi.stubGlobal("crypto", webcrypto);
});

afterAll(() => vi.unstubAllGlobals());

type PendingUpload = {
  file: File;
  options: UploadTransportOptions;
  resolve: (value: { storageId: StorageId; serverSha256?: string | null }) => void;
  reject: (reason?: unknown) => void;
};

/** A deterministic adapter: tests decide when each upload progresses, succeeds, or fails. */
class ControlledTransport implements UploadTransport {
  readonly calls: string[] = [];
  readonly pending = new Map<string, PendingUpload>();
  active = 0;
  peakActive = 0;

  upload(file: File, options: UploadTransportOptions): Promise<{ storageId: StorageId; serverSha256?: string | null }> {
    this.calls.push(file.name);
    this.active += 1;
    this.peakActive = Math.max(this.peakActive, this.active);
    return new Promise((resolve, reject) => {
      this.pending.set(file.name, { file, options, resolve, reject });
      options.signal.addEventListener(
        "abort",
        () => {
          if (!this.pending.delete(file.name)) return;
          this.active -= 1;
          reject(new DOMException("Upload cancelled", "AbortError"));
        },
        { once: true },
      );
    });
  }

  progress(name: string, loaded: number, total: number): void {
    this.pending.get(name)?.options.onProgress({
      loaded,
      total,
      percent: total === 0 ? 100 : Math.round((loaded / total) * 100),
    });
  }

  resolve(name: string, serverSha256: string | null = null): void {
    const pending = this.pending.get(name);
    if (!pending) throw new Error(`No pending upload named ${name}`);
    this.pending.delete(name);
    this.active -= 1;
    pending.resolve({ storageId: `storage-${name}` as StorageId, serverSha256 });
  }

  fail(name: string, error = new Error(`Could not upload ${name}`)): void {
    const pending = this.pending.get(name);
    if (!pending) throw new Error(`No pending upload named ${name}`);
    this.pending.delete(name);
    this.active -= 1;
    pending.reject(error);
  }
}

function file(name: string, contents = "hello"): File {
  const testFile = new File([contents], name, { type: "application/octet-stream" });
  Object.defineProperty(testFile, "arrayBuffer", {
    configurable: true,
    value: async () => new TextEncoder().encode(contents).buffer,
  });
  return testFile;
}

async function expectComplete(manager: BatchUploadManager): Promise<void> {
  await waitFor(() => expect(manager.getSnapshot().isComplete).toBe(true));
}

describe("BatchUploadManager", () => {
  it("falls back when a dropped file cannot be read through arrayBuffer", async () => {
    const dropped = file("dropped.pdf");
    Object.defineProperty(dropped, "arrayBuffer", {
      value: vi.fn().mockRejectedValue(
        new DOMException(
          "The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.",
          "NotReadableError",
        ),
      ),
    });

    await expect(calculateSha256(dropped)).resolves.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("limits the transport to three active uploads and reports byte progress", async () => {
    const transport = new ControlledTransport();
    const manager = new BatchUploadManager({ transport });
    const ids = manager.addFiles([file("one"), file("two"), file("three"), file("four"), file("five")]);

    await waitFor(() => expect(transport.calls).toHaveLength(3));
    expect(transport.peakActive).toBe(3);
    expect(manager.getSnapshot().files.map((entry) => entry.status)).toEqual([
      "uploading",
      "uploading",
      "uploading",
      "queued",
      "queued",
    ]);

    transport.progress("one", 2, 5);
    expect(manager.getSnapshot().files[0].progress).toEqual({ loaded: 2, total: 5, percent: 40 });
    transport.resolve("one");
    await waitFor(() => expect(transport.calls).toHaveLength(4));
    expect(manager.getSnapshot().files.find((entry) => entry.id === ids[3])?.status).toBe("uploading");

    for (const name of ["two", "three", "four", "five"]) {
      transport.resolve(name);
      await waitFor(() => expect(transport.pending.has(name)).toBe(false));
    }
    await expectComplete(manager);
    expect(transport.peakActive).toBe(3);
    expect(manager.getSnapshot().files.every((entry) => entry.status === "succeeded")).toBe(true);
  });

  it("keeps successful entries intact and retries only the selected failed file", async () => {
    const transport = new ControlledTransport();
    const manager = new BatchUploadManager({ transport });
    manager.addFiles([file("good"), file("bad")]);
    await waitFor(() => expect(transport.calls).toHaveLength(2));

    transport.resolve("good");
    transport.fail("bad");
    await expectComplete(manager);
    expect(manager.getSnapshot().files.find((entry) => entry.file.name === "good")).toMatchObject({
      status: "succeeded",
      attempt: 1,
    });
    expect(manager.getSnapshot().files.find((entry) => entry.file.name === "bad")).toMatchObject({
      status: "failed",
      attempt: 1,
      error: "Could not upload bad",
    });

    const badId = manager.getSnapshot().files.find((entry) => entry.file.name === "bad")!.id;
    expect(manager.retry(badId)).toBe(true);
    await waitFor(() => expect(transport.calls.filter((name) => name === "bad")).toHaveLength(2));
    transport.resolve("bad");
    await expectComplete(manager);
    expect(transport.calls).toHaveLength(3);
    expect(transport.calls.filter((name) => name === "good")).toHaveLength(1);
    expect(transport.calls.filter((name) => name === "bad")).toHaveLength(2);
    expect(manager.getSnapshot().files.every((entry) => entry.status === "succeeded")).toBe(true);
  });

  it("cancels active and succeeded files and asks the backend to discard uploaded IDs", async () => {
    const transport = new ControlledTransport();
    const discarded: StorageId[][] = [];
    const manager = new BatchUploadManager({
      transport,
      discardUnreferenced: async (storageIds) => {
        discarded.push([...storageIds]);
      },
    });
    const ids = manager.addFiles([file("kept"), file("cancelled")]);
    await waitFor(() => expect(transport.calls).toHaveLength(2));

    transport.resolve("kept");
    await waitFor(() => expect(manager.getSnapshot().files[0].status).toBe("succeeded"));
    await manager.cancel(ids[1]);
    await manager.cancelAll();
    await expectComplete(manager);

    expect(manager.getSnapshot().files.every((entry) => entry.status === "cancelled")).toBe(true);
    expect(discarded).toEqual([["storage-kept"]]);
    expect(transport.calls).toEqual(["kept", "cancelled"]);
  });

  it("cancels a queued file before it ever reaches the transport", async () => {
    const transport = new ControlledTransport();
    const discarded: StorageId[][] = [];
    const manager = new BatchUploadManager({
      transport,
      maxConcurrent: 1,
      discardUnreferenced: async (storageIds) => {
        discarded.push([...storageIds]);
      },
    });
    // maxConcurrent: 1 keeps "second" queued behind "first" so it's still
    // "queued" (never started) when cancelled, not "uploading" like the
    // active-file case above.
    const ids = manager.addFiles([file("first"), file("second")]);
    await waitFor(() => expect(transport.calls).toEqual(["first"]));
    expect(manager.getSnapshot().files.find((entry) => entry.id === ids[1])?.status).toBe("queued");

    const cancelled = await manager.cancel(ids[1]);

    expect(cancelled).toBe(true);
    expect(manager.getSnapshot().files.find((entry) => entry.id === ids[1])).toMatchObject({
      status: "cancelled",
      uploaded: null,
    });
    expect(transport.calls).toEqual(["first"]); // the queued file never reached the transport
    expect(discarded).toEqual([]); // nothing was ever uploaded for it, so nothing needs discarding

    transport.resolve("first");
    await expectComplete(manager);
  });

  it("reports cleanup failure and retains cancelled entries for recovery", async () => {
    const transport = new ControlledTransport();
    const manager = new BatchUploadManager({
      transport,
      discardUnreferenced: async () => {
        throw new Error("backend unavailable");
      },
    });
    manager.addFiles([file("orphan")]);
    await waitFor(() => expect(transport.calls).toEqual(["orphan"]));
    transport.resolve("orphan");
    await expectComplete(manager);

    await expect(manager.cancelAll()).resolves.toBe(false);
    expect(manager.getSnapshot()).toMatchObject({
      error: "Upload cleanup failed: backend unavailable",
      files: [{ status: "cancelled", uploaded: { storageId: "storage-orphan" } }],
    });
  });

  it("chunks cancelAll's cleanup call to at most MAX_DISCARD_BATCH_SIZE IDs, and a failing chunk doesn't block the rest", async () => {
    const transport = new ControlledTransport();
    const fileCount = 51; // one more than MAX_DISCARD_BATCH_SIZE, so this must span two chunks
    const names = Array.from({ length: fileCount }, (_, index) => `file-${index}`);
    const lastStorageId = `storage-${names[fileCount - 1]}` as StorageId;

    let rejectChunkWithLastId = true;
    const discardCalls: StorageId[][] = [];
    const manager = new BatchUploadManager({
      transport,
      discardUnreferenced: async (storageIds) => {
        discardCalls.push([...storageIds]);
        if (rejectChunkWithLastId && storageIds.includes(lastStorageId)) {
          throw new Error("chunk unavailable");
        }
      },
    });

    manager.addFiles(names.map((name) => file(name)));
    for (const name of names) {
      await waitFor(() => expect(transport.pending.has(name)).toBe(true));
      transport.resolve(name);
    }
    await expectComplete(manager);

    // First pass: the chunk holding file-50 fails, the chunk holding
    // file-0..file-49 succeeds. Both are still attempted (no chunk skipped
    // because an earlier one failed), and no single call exceeds the cap.
    await expect(manager.cancelAll()).resolves.toBe(false);
    expect(discardCalls).toHaveLength(2);
    for (const call of discardCalls) expect(call.length).toBeLessThanOrEqual(MAX_DISCARD_BATCH_SIZE);
    expect(discardCalls.flat().sort()).toEqual(
      names.map((name) => `storage-${name}`).sort(),
    );
    expect(manager.getSnapshot().error).toBe("Upload cleanup failed: chunk unavailable");

    // Second pass: only the previously-failed entry should still need
    // cleanup — the other 50 were already marked cleaned and must not be
    // resent.
    discardCalls.length = 0;
    rejectChunkWithLastId = false;
    await expect(manager.cancelAll()).resolves.toBe(true);
    expect(discardCalls).toEqual([[lastStorageId]]);
  });

  it("calculates SHA-256, records comparison metadata, and warns at the configured threshold", async () => {
    const transport = new ControlledTransport();
    const manager = new BatchUploadManager({ transport, largeFileWarningBytes: 5 });
    manager.addFiles([file("hash.txt")]);
    expect(manager.getSnapshot().files[0].warning).toContain("Large file");
    expect(DEFAULT_LARGE_FILE_WARNING_BYTES).toBe(100 * 1024 * 1024);
    await waitFor(() => expect(transport.calls).toEqual(["hash.txt"]));

    transport.progress("hash.txt", 5, 5);
    transport.resolve("hash.txt", "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    await expectComplete(manager);
    const uploaded = manager.getSnapshot().files[0].uploaded!;
    expect(uploaded.sha256).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(uploaded.hash).toEqual({
      algorithm: "SHA-256",
      clientSha256: uploaded.sha256,
      serverSha256: uploaded.sha256,
      matches: true,
    });
    expect(manager.getSnapshot().files[0].progress.percent).toBe(100);
  });

  it("registers each uploaded blob before exposing it as succeeded", async () => {
    const transport = new ControlledTransport();
    const registered: string[] = [];
    const manager = new BatchUploadManager({
      transport,
      registerUpload: async (upload) => {
        registered.push(upload.storageId);
      },
    });
    manager.addFiles([file("registered")]);
    await waitFor(() => expect(transport.calls).toEqual(["registered"]));
    transport.resolve("registered");
    await expectComplete(manager);

    expect(registered).toEqual(["storage-registered"]);
    expect(manager.getSnapshot().files[0].status).toBe("succeeded");
  });

  it("rejects a server hash mismatch and cleans the resulting blob", async () => {
    const transport = new ControlledTransport();
    const discarded: StorageId[][] = [];
    const manager = new BatchUploadManager({
      transport,
      discardUnreferenced: async (storageIds) => {
        discarded.push([...storageIds]);
      },
    });
    manager.addFiles([file("tampered")]);
    await waitFor(() => expect(transport.calls).toEqual(["tampered"]));
    transport.resolve("tampered", "0000000000000000000000000000000000000000000000000000000000000000");
    await expectComplete(manager);

    expect(manager.getSnapshot().files[0]).toMatchObject({
      status: "failed",
      error: "Uploaded file failed SHA-256 verification",
      uploaded: { hash: { matches: false } },
    });
    expect(discarded).toEqual([["storage-tampered"]]);
  });
});
