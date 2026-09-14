import { describe, expect, test } from "vitest";
import { emptyCandidateDate, isFilled, toCandidateDateInput } from "./candidateDate";

describe("isFilled", () => {
  test("a row is real once it has a date, times or not", () => {
    expect(isFilled({ date: "2026-03-01", startTime: "", endTime: "" })).toBe(true);
  });

  test("a row with only times is not", () => {
    expect(isFilled({ date: "", startTime: "19:00", endTime: "21:00" })).toBe(false);
  });

  test("an empty row is not", () => {
    expect(isFilled(emptyCandidateDate())).toBe(false);
  });
});

describe("toCandidateDateInput", () => {
  test("a blank start time means the whole day, stored as local midnight", () => {
    expect(toCandidateDateInput({ date: "2026-03-01", startTime: "", endTime: "" })).toEqual({
      startsAt: new Date(2026, 2, 1, 0, 0).getTime(),
      endsAt: undefined,
    });
  });

  test("an end time makes a window on the same date", () => {
    expect(toCandidateDateInput({ date: "2026-03-01", startTime: "19:00", endTime: "21:00" })).toEqual({
      startsAt: new Date(2026, 2, 1, 19, 0).getTime(),
      endsAt: new Date(2026, 2, 1, 21, 0).getTime(),
    });
  });
});
