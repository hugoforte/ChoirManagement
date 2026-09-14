import { useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BatchUploadManager,
  type BatchUploadSnapshot,
  type StorageId,
  type UploadedFile,
  type UploadTransport,
} from "./batchUpload";
import { createBrowserUploadTransport } from "./uploadTransport";

type GenerateUploadUrlMutation = FunctionReference<"mutation", "public", Record<string, never>, string>;

export interface UseBatchUploadOptions {
  transport?: UploadTransport;
  maxConcurrent?: number;
  largeFileWarningBytes?: number;
  registerUpload?: (upload: UploadedFile) => Promise<void> | void;
  discardUnreferenced?: (storageIds: readonly StorageId[]) => Promise<void>;
}

export interface UseBatchUploadResult extends BatchUploadSnapshot {
  addFiles: (files: readonly File[]) => string[];
  retry: (fileId: string) => boolean;
  cancel: (fileId: string) => Promise<boolean>;
  cancelAll: () => Promise<boolean>;
  clearCompleted: () => void;
}

/**
 * The batch counterpart to useUpload. It deliberately has a separate return
 * shape so the existing Settings logo flow remains source-compatible.
 */
export function useBatchUpload<Mutation extends GenerateUploadUrlMutation>(
  generateUploadUrl: Mutation,
  options: UseBatchUploadOptions = {},
): UseBatchUploadResult {
  const generateUrlMutation = useMutation(generateUploadUrl);
  // useTrackedMutation deliberately serializes calls. This batch needs up to
  // three URL generations at once, so the manager catches and exposes these
  // mutation errors through its per-file/global error state instead.
  const registerRef = useRef(options.registerUpload);
  const discardRef = useRef(options.discardUnreferenced);
  // Keep the refs current without writing to them during render (writing
  // during render is impure and only "worked" here because nothing in
  // render observed the write back). An effect that runs after every
  // render is the React-sanctioned place for this.
  useEffect(() => {
    registerRef.current = options.registerUpload;
    discardRef.current = options.discardUnreferenced;
  });

  // The manager owns an in-flight upload queue with live AbortControllers.
  // It used to be created with useMemo keyed on options/transport, so any
  // caller passing a fresh inline options object (or changing
  // maxConcurrent/transport) mid-batch silently swapped in a brand new
  // manager and orphaned whatever that old manager was uploading. It's
  // created exactly once now, for the hook's lifetime, via this lazy
  // useState initializer. `registerUpload` and `discardUnreferenced` still
  // track later prop changes through the refs above. `transport`,
  // `maxConcurrent`, and `largeFileWarningBytes` do not: BatchUploadManager
  // has no setters for them, so they're intentionally read once here, on
  // mount, and a later change to those specific props has no effect.
  const [manager] = useState(
    () =>
      new BatchUploadManager({
        transport:
          options.transport ??
          createBrowserUploadTransport(async () => {
            // A zero-argument Convex mutation is represented by
            // OptionalRestArgs; the constraint above guarantees this cast
            // has no runtime arguments.
            return await (generateUrlMutation as unknown as () => Promise<string>)();
          }),
        maxConcurrent: options.maxConcurrent,
        largeFileWarningBytes: options.largeFileWarningBytes,
        registerUpload: (upload) => registerRef.current?.(upload),
        discardUnreferenced: async (storageIds) => {
          const discard = discardRef.current;
          if (!discard) throw new Error("No cleanup handler was configured");
          await discard(storageIds);
        },
      }),
  );
  const subscribe = useCallback((listener: () => void) => manager.subscribe(listener), [manager]);
  const getSnapshot = useCallback(() => manager.getSnapshot(), [manager]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    ...snapshot,
    addFiles: useCallback((files: readonly File[]) => manager.addFiles(files), [manager]),
    retry: useCallback((fileId: string) => manager.retry(fileId), [manager]),
    cancel: useCallback((fileId: string) => manager.cancel(fileId), [manager]),
    cancelAll: useCallback(() => manager.cancelAll(), [manager]),
    clearCompleted: useCallback(() => manager.clearCompleted(), [manager]),
  };
}
