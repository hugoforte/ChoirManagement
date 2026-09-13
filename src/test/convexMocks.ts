import type { Mock } from "vitest";
import type { useMutation } from "convex/react";

// convex/react's real useMutation return type is `ReactMutation` — it
// carries `withOptimisticUpdate` alongside the callable itself, which a
// plain `vi.fn()` doesn't structurally satisfy. Every test mocking a
// mutation needs this same cast; one place for it instead of one per file.
// Takes the mock itself (not its implementation) so a caller keeps the same
// reference to assert against (`toHaveBeenCalledTimes`, etc.).
export function asMutation(mock: Mock): ReturnType<typeof useMutation> {
  return mock as unknown as ReturnType<typeof useMutation>;
}
