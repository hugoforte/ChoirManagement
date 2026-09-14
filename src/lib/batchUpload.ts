import type { Id } from "../../convex/_generated/dataModel";

export const DEFAULT_MAX_CONCURRENT_UPLOADS = 3;
export const DEFAULT_LARGE_FILE_WARNING_BYTES = 100 * 1024 * 1024;
/**
 * The discard/cleanup mutation this manager calls through
 * `discardUnreferenced` rejects calls with more than 50 storage IDs (see the
 * backend mutation on the stacked branch that adds it). The manager only
 * holds a callback slot for that mutation, so batching to this ceiling has
 * to happen here rather than on the backend side.
 */
export const MAX_DISCARD_BATCH_SIZE = 50;

export type StorageId = Id<"_storage">;
export type UploadStatus = "queued" | "uploading" | "succeeded" | "failed" | "cancelled";

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadHashMetadata {
  algorithm: "SHA-256";
  clientSha256: string;
  serverSha256: string | null;
  matches: boolean | null;
}

export interface UploadedFile {
  fileId: string;
  storageId: StorageId;
  originalFilename: string;
  contentType: string;
  size: number;
  sha256: string;
  hash: UploadHashMetadata;
}

export interface UploadTransportResult {
  storageId: StorageId;
  /** A server-provided fingerprint, when the transport/backend exposes one. */
  serverSha256?: string | null;
}

export interface UploadTransportOptions {
  signal: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
}

/**
 * A transport owns the wire protocol. The queue only knows about files,
 * progress, and storage IDs, which keeps routes independent of XHR/Convex
 * upload details and makes the queue deterministic to test.
 */
export interface UploadTransport {
  upload(file: File, options: UploadTransportOptions): Promise<UploadTransportResult>;
}

export interface TrackedUpload {
  id: string;
  file: File;
  status: UploadStatus;
  progress: UploadProgress;
  warning: string | null;
  attempt: number;
  error: string | null;
  uploaded: UploadedFile | null;
}

export interface BatchUploadSnapshot {
  files: readonly TrackedUpload[];
  error: string | null;
  isUploading: boolean;
  isComplete: boolean;
}

export interface BatchUploadManagerOptions {
  transport: UploadTransport;
  maxConcurrent?: number;
  largeFileWarningBytes?: number;
  registerUpload?: (upload: UploadedFile) => Promise<void> | void;
  discardUnreferenced?: (storageIds: readonly StorageId[]) => Promise<void>;
}

type Listener = () => void;

interface InternalUpload extends TrackedUpload {
  controller: AbortController | null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Upload failed. Please try again.";
}

export function createAbortError(): DOMException {
  return new DOMException("Upload cancelled", "AbortError");
}

function readFileWithFileReader(file: File): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Could not read file bytes for hashing"));
    });
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Could not read file bytes for hashing")),
    );
    reader.readAsArrayBuffer(file);
  });
}

/** Calculate the browser's canonical lowercase SHA-256 hex digest. */
export async function calculateSha256(file: File): Promise<string> {
  let bytes: ArrayBuffer;
  if (typeof file.arrayBuffer !== "function") {
    bytes = await readFileWithFileReader(file);
  } else {
    try {
      bytes = await file.arrayBuffer();
    } catch (arrayBufferError) {
      try {
        bytes = await readFileWithFileReader(file);
      } catch {
        throw arrayBufferError;
      }
    }
  }
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function initialProgress(file: File): UploadProgress {
  return { loaded: 0, total: file.size, percent: 0 };
}

function completedProgress(file: File): UploadProgress {
  return { loaded: file.size, total: file.size, percent: 100 };
}

function isTerminal(status: UploadStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function isUploadCancelled(upload: InternalUpload): boolean {
  return upload.status === "cancelled";
}

/**
 * Tracks a non-resumable in-memory upload batch. Uploaded storage IDs are
 * intentionally retained in the snapshot until the caller publishes or
 * cancels the batch, so the caller can register/publish them safely.
 */
export class BatchUploadManager {
  private readonly transport: UploadTransport;
  private readonly maxConcurrent: number;
  private readonly largeFileWarningBytes: number;
  private readonly registerUpload?: BatchUploadManagerOptions["registerUpload"];
  private readonly discardUnreferenced?: BatchUploadManagerOptions["discardUnreferenced"];
  private readonly uploads = new Map<string, InternalUpload>();
  private readonly listeners = new Set<Listener>();
  private readonly cleanedStorageIds = new Set<StorageId>();
  private readonly cleaningStorageIds = new Set<StorageId>();
  private nextId = 1;
  private activeCount = 0;
  private batchError: string | null = null;
  private snapshot: BatchUploadSnapshot = {
    files: [],
    error: null,
    isUploading: false,
    isComplete: false,
  };

  constructor(options: BatchUploadManagerOptions) {
    if (options.maxConcurrent !== undefined && (!Number.isInteger(options.maxConcurrent) || options.maxConcurrent < 1)) {
      throw new Error("maxConcurrent must be a positive integer");
    }
    if (
      options.largeFileWarningBytes !== undefined &&
      (!Number.isFinite(options.largeFileWarningBytes) || options.largeFileWarningBytes <= 0)
    ) {
      throw new Error("largeFileWarningBytes must be positive");
    }
    this.transport = options.transport;
    // Callers may lower concurrency for a constrained device, but cannot
    // raise the safety ceiling that this module promises.
    this.maxConcurrent = Math.min(
      options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT_UPLOADS,
      DEFAULT_MAX_CONCURRENT_UPLOADS,
    );
    this.largeFileWarningBytes = options.largeFileWarningBytes ?? DEFAULT_LARGE_FILE_WARNING_BYTES;
    this.registerUpload = options.registerUpload;
    this.discardUnreferenced = options.discardUnreferenced;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): BatchUploadSnapshot => this.snapshot;

  addFiles(files: readonly File[]): string[] {
    const ids: string[] = [];
    for (const file of files) {
      const id = `upload-${this.nextId++}`;
      ids.push(id);
      this.uploads.set(id, {
        id,
        file,
        status: "queued",
        progress: initialProgress(file),
        warning:
          file.size >= this.largeFileWarningBytes
            ? `Large file: ${(file.size / (1024 * 1024)).toFixed(1)} MB. Upload may take a while.`
            : null,
        attempt: 0,
        error: null,
        uploaded: null,
        controller: null,
      });
    }
    if (ids.length > 0) {
      this.batchError = null;
      this.publish();
      void this.pump();
    }
    return ids;
  }

  retry(fileId: string): boolean {
    const upload = this.uploads.get(fileId);
    if (!upload || upload.status !== "failed") return false;
    upload.status = "queued";
    upload.progress = initialProgress(upload.file);
    upload.error = null;
    upload.uploaded = null;
    this.batchError = null;
    this.publish();
    void this.pump();
    return true;
  }

  async cancel(fileId: string): Promise<boolean> {
    const upload = this.uploads.get(fileId);
    if (!upload || upload.status === "cancelled") return true;
    this.cancelUpload(upload);
    const cleaned = await this.cleanupUploads([upload]);
    this.publish();
    return cleaned;
  }

  async cancelAll(): Promise<boolean> {
    const uploads = [...this.uploads.values()];
    for (const upload of uploads) this.cancelUpload(upload);
    const cleaned = await this.cleanupUploads(uploads);
    this.publish();
    return cleaned;
  }

  clearCompleted(): void {
    for (const [id, upload] of this.uploads) {
      if (isTerminal(upload.status)) this.uploads.delete(id);
    }
    this.publish();
  }

  private cancelUpload(upload: InternalUpload): void {
    if (upload.status === "queued" || upload.status === "uploading" || upload.status === "failed" || upload.status === "succeeded") {
      upload.status = "cancelled";
      upload.error = null;
      upload.controller?.abort();
    }
  }

  private async pump(): Promise<void> {
    while (this.activeCount < this.maxConcurrent) {
      const next = [...this.uploads.values()].find((upload) => upload.status === "queued");
      if (!next) return;
      this.activeCount += 1;
      void this.run(next);
    }
  }

  private async run(upload: InternalUpload): Promise<void> {
    const controller = new AbortController();
    upload.controller = controller;
    upload.attempt += 1;
    upload.status = "uploading";
    this.publish();

    try {
      const clientSha256 = await calculateSha256(upload.file);
      if (controller.signal.aborted || isUploadCancelled(upload)) throw createAbortError();

      const result = await this.transport.upload(upload.file, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!isUploadCancelled(upload)) {
            const total = progress.total || upload.file.size;
            const loaded = Math.max(0, Math.min(progress.loaded, total));
            upload.progress = {
              loaded,
              total,
              percent: total === 0 ? 100 : Math.round((loaded / total) * 100),
            };
            this.publish();
          }
        },
      });
      const serverSha256 = result.serverSha256 ?? null;
      const hash: UploadHashMetadata = {
        algorithm: "SHA-256",
        clientSha256,
        serverSha256,
        matches: serverSha256 === null ? null : clientSha256 === serverSha256.toLowerCase(),
      };
      const uploaded: UploadedFile = {
        fileId: upload.id,
        storageId: result.storageId,
        originalFilename: upload.file.name,
        contentType: upload.file.type || "application/octet-stream",
        size: upload.file.size,
        sha256: clientSha256,
        hash,
      };
      upload.uploaded = uploaded;

      if (controller.signal.aborted || isUploadCancelled(upload)) {
        await this.cleanupUploads([upload]);
        return;
      }
      if (hash.matches === false) {
        throw new Error("Uploaded file failed SHA-256 verification");
      }
      if (this.registerUpload) await this.registerUpload(uploaded);
      if (isUploadCancelled(upload)) {
        await this.cleanupUploads([upload]);
        return;
      }
      upload.status = "succeeded";
      upload.progress = completedProgress(upload.file);
      upload.error = null;
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted || isUploadCancelled(upload)) {
        upload.status = "cancelled";
        upload.error = null;
        if (upload.uploaded) await this.cleanupUploads([upload]);
      } else {
        upload.status = "failed";
        upload.error = errorMessage(error);
        if (upload.uploaded) await this.cleanupUploads([upload]);
      }
    } finally {
      upload.controller = null;
      this.activeCount -= 1;
      this.publish();
      await this.pump();
    }
  }

  private async cleanupUploads(uploads: readonly InternalUpload[]): Promise<boolean> {
    const storageIds = uploads
      .map((upload) => upload.uploaded?.storageId)
      .filter((storageId): storageId is StorageId => storageId !== undefined)
      .filter(
        (storageId) =>
          !this.cleanedStorageIds.has(storageId) && !this.cleaningStorageIds.has(storageId),
      );
    if (storageIds.length === 0) return true;
    for (const storageId of storageIds) this.cleaningStorageIds.add(storageId);
    const discardUnreferenced = this.discardUnreferenced;
    if (!discardUnreferenced) {
      for (const storageId of storageIds) this.cleaningStorageIds.delete(storageId);
      this.batchError = "Uploaded files need cleanup, but no cleanup handler was configured.";
      return false;
    }

    // The backend discard mutation caps how many storage IDs it accepts per
    // call, so a large batch has to be split here. Chunks are attempted
    // independently (Promise.allSettled, not the first rejection short-
    // circuiting the rest) so one bad chunk doesn't strand the storage IDs
    // in every other chunk as un-cleaned: successful chunks are recorded as
    // cleaned immediately, and only the failed chunk's IDs stay eligible for
    // a retry on the next cleanup pass.
    const chunks: StorageId[][] = [];
    for (let start = 0; start < storageIds.length; start += MAX_DISCARD_BATCH_SIZE) {
      chunks.push(storageIds.slice(start, start + MAX_DISCARD_BATCH_SIZE));
    }
    const results = await Promise.allSettled(chunks.map((chunk) => discardUnreferenced(chunk)));

    let firstErrorMessage: string | null = null;
    results.forEach((result, index) => {
      const chunk = chunks[index];
      if (result.status === "fulfilled") {
        for (const storageId of chunk) {
          this.cleaningStorageIds.delete(storageId);
          this.cleanedStorageIds.add(storageId);
        }
      } else {
        for (const storageId of chunk) this.cleaningStorageIds.delete(storageId);
        firstErrorMessage ??= errorMessage(result.reason);
      }
    });

    if (firstErrorMessage !== null) {
      this.batchError = `Upload cleanup failed: ${firstErrorMessage}`;
      return false;
    }
    return true;
  }

  private publish(): void {
    const files = [...this.uploads.values()].map(({ controller: _controller, ...upload }) => ({
      ...upload,
      progress: { ...upload.progress },
    }));
    this.snapshot = {
      files,
      error: this.batchError,
      isUploading: this.activeCount > 0,
      isComplete: files.length > 0 && files.every((upload) => isTerminal(upload.status)),
    };
    for (const listener of this.listeners) listener();
  }
}
