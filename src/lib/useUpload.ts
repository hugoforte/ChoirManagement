// Convex's upload protocol used to leak into two routes as near-identical
// 18-line blocks (Settings' logo, LibraryManage's Piece files): the same
// generateUploadUrl → fetch POST → storageId parse → attach mutation dance,
// the same uploading flag, the same input reset — and neither had a failure
// path (see #32). One interface now: `const { upload, uploading, error } =
// useUpload(api.pieces.generateUploadUrl); const storageId = await
// upload(file)`.
//
// Built on useTrackedMutation (#29), not a second mutation-calling
// convention beside it — the generateUploadUrl leg gets the same
// pending/error tracking every other mutation in the app does; only the
// raw fetch POST in between (not a Convex call) needs its own try/catch.
//
// Two adapters justify the seam: the real fetch call here, and a fake
// swapped in at the global fetch level for tests (#34) — no injected
// adapter parameter on this hook itself, since mocking global fetch is
// the idiomatic way to test code that calls it, and inventing a bespoke
// DI mechanism here would just be a second pattern for #34 to reconcile.
import { useState } from "react";
import type { FunctionReference } from "convex/server";
import { Id } from "../../convex/_generated/dataModel";
import { useTrackedMutation } from "./useTrackedMutation";

type GenerateUploadUrl = FunctionReference<"mutation", "public", Record<string, never>, string>;

export function useUpload<Mutation extends GenerateUploadUrl>(generateUploadUrl: Mutation) {
  const { run: generateUrl, error: generateError } = useTrackedMutation(generateUploadUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(file: File): Promise<Id<"_storage"> | undefined> {
    setUploading(true);
    setUploadError(null);
    try {
      // Cast, not a bare call: TS can't resolve OptionalRestArgs<Mutation>'s
      // conditional branch over an unresolved generic, even though the
      // GenerateUploadUrl constraint above already guarantees zero required
      // args and a string return.
      const runNoArgs = generateUrl as unknown as () => Promise<string | undefined>;
      const uploadUrl = await runNoArgs();
      if (uploadUrl === undefined) return undefined; // generateUrl's own error is already surfaced

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      return storageId;
    } catch {
      setUploadError("Upload failed. Please try again.");
      return undefined;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading, error: generateError ?? uploadError };
}
