import { describe, expect, test } from "vitest";
import { moveSetlistItem } from "./setlist";

describe("moveSetlistItem", () => {
  test("swaps with the previous item when moving up", () => {
    expect(moveSetlistItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
  });

  test("swaps with the next item when moving down", () => {
    expect(moveSetlistItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  test("is a no-op moving the first item up", () => {
    const items = ["a", "b", "c"];
    expect(moveSetlistItem(items, 0, -1)).toBe(items);
  });

  test("is a no-op moving the last item down", () => {
    const items = ["a", "b", "c"];
    expect(moveSetlistItem(items, 2, 1)).toBe(items);
  });

  test("does not mutate the input array", () => {
    const items = ["a", "b", "c"];
    moveSetlistItem(items, 0, 1);
    expect(items).toEqual(["a", "b", "c"]);
  });
});
