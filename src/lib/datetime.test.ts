import { describe, expect, test } from "vitest";
import { toDatetimeLocal } from "./datetime";

describe("toDatetimeLocal", () => {
  test("pads single-digit month, day, hour, and minute", () => {
    const ms = new Date(2026, 0, 5, 9, 3).getTime();
    expect(toDatetimeLocal(ms)).toBe("2026-01-05T09:03");
  });

  test("does not pad double-digit values", () => {
    const ms = new Date(2026, 10, 23, 14, 45).getTime();
    expect(toDatetimeLocal(ms)).toBe("2026-11-23T14:45");
  });
});
