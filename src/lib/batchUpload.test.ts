import { waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BatchUploadManager,
  DEFAULT_LARGE_FILE_WARNING_BYTES,
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
    value: async () => new TextEncoder().encode(contents).buffer,
  });
  return testFile;
}

async function expectComplete(manager: BatchUploadManager): Promise<void> {
  await waitFor(() => expect(manager.getSnapshot().isComplete).toBe(true));
}

describe("BatchUploadManager", () => {
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

  it("cancels queued and active files and asks the backend to discard uploaded IDs", async () => {
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
