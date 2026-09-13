import { useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import {
  BatchUploadManager,
  type BatchUploadManagerOptions,
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
  registerRef.current = options.registerUpload;
  discardRef.current = options.discardUnreferenced;

  const callbackAdapters = useMemo<Pick<BatchUploadManagerOptions, "registerUpload" | "discardUnreferenced">>(
    () => ({
      registerUpload: (upload) => registerRef.current?.(upload),
      discardUnreferenced: async (storageIds) => {
        const discard = discardRef.current;
        if (!discard) throw new Error("No cleanup handler was configured");
        await discard(storageIds);
      },
    }),
    [],
  );
  const transport = useMemo(
    () =>
      options.transport ??
      createBrowserUploadTransport(async () => {
        // A zero-argument Convex mutation is represented by OptionalRestArgs;
        // the constraint above guarantees this cast has no runtime arguments.
        return await (generateUrlMutation as unknown as () => Promise<string>)();
      }),
    [generateUrlMutation, options.transport],
  );
  const manager = useMemo(
    () =>
      new BatchUploadManager({
        transport,
        maxConcurrent: options.maxConcurrent,
        largeFileWarningBytes: options.largeFileWarningBytes,
        ...callbackAdapters,
      }),
    [callbackAdapters, options.largeFileWarningBytes, options.maxConcurrent, transport],
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
