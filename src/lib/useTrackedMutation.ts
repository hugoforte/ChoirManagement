// The seam every mutation call site was missing (see #29): a Convex
// mutation wrapped with pending/error tracking, so a caller has something
// to show for a rejection instead of nothing. Before this, six call sites
// hand-rolled `setSaving(true)/try/finally setSaving(false)` with no catch,
// and the rest were fire-and-forget `onClick={() => mutate(...)}` — either
// way, a requireCan refusal or a network blip silently no-opped: the
// spinner reset and the button re-enabled as if it had worked.
//
// One real caveat, verified against Convex's own docs, not assumed: per
// AGENTS.md's "throw, don't return discriminated unions" rule, this app's
// backend throws plain Errors (never ConvexError). Convex redacts a plain
// Error's message to a generic one on a production deployment — only
// ConvexError's `.data` survives to the client in prod. So `error` here is
// a real, specific message in local dev, and a generic "Server Error"-style
// message in production. That's still a strict improvement over today
// (nothing shown at all), but curating a specific message per failure in
// production would mean adopting ConvexError — a bigger, separate decision
// this ticket doesn't make.
import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";

export function useTrackedMutation<Mutation extends FunctionReference<"mutation">>(mutation: Mutation) {
  const mutate = useMutation(mutation);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not the `pending` state, so a caller that forgets to disable its
  // own button while pending still can't fire a second overlapping call.
  const pendingRef = useRef(false);

  // OptionalRestArgs, the same type Convex's own useMutation/runMutation use
  // — makes `args` omittable for a {}-args mutation (generateUploadUrl and
  // friends), required otherwise, without a manually-cast default.
  const run = useCallback(
    async (...args: OptionalRestArgs<Mutation>): Promise<FunctionReturnType<Mutation> | undefined> => {
      if (pendingRef.current) return undefined;
      pendingRef.current = true;
      setPending(true);
      setError(null);
      try {
        return await mutate(...args);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.");
        return undefined;
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [mutate],
  );

  return { run, pending, error };
}
