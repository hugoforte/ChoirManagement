import { describe, expect, test } from "vitest";

import { AVAILABILITY_LABEL, AVAILABILITY_VALUES } from "./availability";

describe("AVAILABILITY_VALUES", () => {
  // The list is built from a Record keyed by every schema value, so this
  // also fails the day a fourth value is added and left unordered.
  test("offers every value the schema allows", () => {
    expect([...AVAILABILITY_VALUES].sort()).toEqual(["available", "if_needed", "unavailable"]);
  });

  test("reads If needed between Available and Unavailable, never after them", () => {
    expect(AVAILABILITY_VALUES.map((value) => AVAILABILITY_LABEL[value])).toEqual([
      "Available",
      "If needed",
      "Unavailable",
    ]);
  });
});
