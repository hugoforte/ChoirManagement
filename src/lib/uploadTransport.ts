import { createAbortError, type UploadProgress, type UploadTransport, type UploadTransportResult } from "./batchUpload";

export type GenerateUploadUrl = () => Promise<string>;

function reportProgress(event: ProgressEvent<EventTarget>, fallbackTotal: number): UploadProgress {
  const total = event.lengthComputable && event.total > 0 ? event.total : fallbackTotal;
  const loaded = Math.min(event.loaded, total);
  return {
    loaded,
    total,
    percent: total === 0 ? 100 : Math.round((loaded / total) * 100),
  };
}

/**
 * Production Convex storage adapter. XHR is intentional here: unlike fetch,
 * browser XHR exposes upload byte progress. The queue and routes never need
 * to know about this protocol.
 */
export function createBrowserUploadTransport(generateUploadUrl: GenerateUploadUrl): UploadTransport {
  return {
    async upload(file, { signal, onProgress }): Promise<UploadTransportResult> {
      const uploadUrl = await generateUploadUrl();
      if (signal.aborted) throw createAbortError();

      return await new Promise<UploadTransportResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let settled = false;
        const settle = (callback: () => void) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", abort);
          callback();
        };
        const abort = () => {
          xhr.abort();
          settle(() => reject(createAbortError()));
        };

        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.addEventListener("progress", (event) => onProgress(reportProgress(event, file.size)));
        xhr.addEventListener("load", () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            settle(() => reject(new Error(`Upload failed (${xhr.status})`)));
            return;
          }
          try {
            const body = JSON.parse(xhr.responseText) as { storageId?: unknown; sha256?: unknown };
            if (typeof body.storageId !== "string" || body.storageId.length === 0) {
              throw new Error("Upload response did not include a storage ID");
            }
            settle(() =>
              resolve({
                storageId: body.storageId as UploadTransportResult["storageId"],
                serverSha256: typeof body.sha256 === "string" ? body.sha256 : null,
              }),
            );
          } catch (error) {
            settle(() => reject(error));
          }
        });
        xhr.addEventListener("error", () => settle(() => reject(new Error("Upload failed. Please try again."))));
        xhr.addEventListener("abort", () => settle(() => reject(createAbortError())));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) {
          abort();
          return;
        }
        xhr.send(file);
      });
    },
  };
}

