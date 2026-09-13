import { describe, expect, test, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useTrackedMutation } from "./useTrackedMutation";
import { asMutation } from "../test/convexMocks";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));

const fakeMutation = {} as FunctionReference<"mutation">;

describe("useTrackedMutation", () => {
  test("clears a prior error and resolves the mutation's return value on success", async () => {
    const mutate = vi.fn().mockResolvedValue("ok");
    vi.mocked(useMutation).mockReturnValue(asMutation(mutate));
    const { result } = renderHook(() => useTrackedMutation(fakeMutation));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.run();
    });

    expect(resolved).toBe("ok");
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // This is the exact failure this hook exists to fix (see #29): before it,
  // a rejected mutation reset the spinner and re-enabled the button as if
  // it had worked, with nothing shown for the refusal.
  test("surfaces the thrown Error's message and returns undefined instead of throwing", async () => {
    const mutate = vi.fn().mockRejectedValue(new Error("Only a Director may do that."));
    vi.mocked(useMutation).mockReturnValue(asMutation(mutate));
    const { result } = renderHook(() => useTrackedMutation(fakeMutation));

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.run();
    });

    expect(resolved).toBeUndefined();
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe("Only a Director may do that.");
  });

  test("falls back to a generic message for a non-Error rejection", async () => {
    const mutate = vi.fn().mockRejectedValue("nope");
    vi.mocked(useMutation).mockReturnValue(asMutation(mutate));
    const { result } = renderHook(() => useTrackedMutation(fakeMutation));

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error).toBe("Something went wrong. Please try again.");
  });

  test("a second overlapping call is ignored while the first is still pending", async () => {
    let resolveFirst!: (value: string) => void;
    const mutate = vi.fn().mockReturnValue(new Promise((resolve) => (resolveFirst = resolve)));
    vi.mocked(useMutation).mockReturnValue(asMutation(mutate));
    const { result } = renderHook(() => useTrackedMutation(fakeMutation));

    let firstCall: Promise<unknown>;
    let secondResult: unknown;
    act(() => {
      firstCall = result.current.run();
    });
    await waitFor(() => expect(result.current.pending).toBe(true));
    await act(async () => {
      secondResult = await result.current.run();
    });

    expect(secondResult).toBeUndefined();
    expect(mutate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst("ok");
      await firstCall;
    });
  });
});
