import { describe, expect, test } from "vitest";
import {
  formatCandidateDate,
  fromDateInput,
  fromDateInputEndOfDay,
  toDateInput,
  toDatetimeLocal,
  toTimeInput,
} from "./datetime";

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

describe("toDateInput", () => {
  test("gives the local date, padded", () => {
    expect(toDateInput(new Date(2026, 0, 5, 9, 3).getTime())).toBe("2026-01-05");
  });
});

describe("toTimeInput", () => {
  test("gives the local time, padded", () => {
    expect(toTimeInput(new Date(2026, 0, 5, 9, 3).getTime())).toBe("09:03");
  });
});

describe("fromDateInput", () => {
  test("a date with no time is local midnight, not UTC midnight", () => {
    expect(fromDateInput("2026-03-01")).toBe(new Date(2026, 2, 1, 0, 0).getTime());
  });

  test("applies a time when one is given", () => {
    expect(fromDateInput("2026-03-01", "19:30")).toBe(new Date(2026, 2, 1, 19, 30).getTime());
  });

  test("round-trips through toDateInput and toTimeInput", () => {
    const ms = new Date(2026, 2, 1, 19, 30).getTime();
    expect(fromDateInput(toDateInput(ms), toTimeInput(ms))).toBe(ms);
  });
});

describe("fromDateInputEndOfDay", () => {
  test("a deadline covers the whole chosen day, not just its first instant", () => {
    expect(fromDateInputEndOfDay("2026-03-01")).toBe(new Date(2026, 2, 1, 23, 59, 59, 999).getTime());
  });

  test("still reads back as the date the Director picked", () => {
    expect(toDateInput(fromDateInputEndOfDay("2026-03-01"))).toBe("2026-03-01");
  });

  test("is later than the same day's Candidate Date midnight", () => {
    expect(fromDateInputEndOfDay("2026-03-01")).toBeGreaterThan(fromDateInput("2026-03-01"));
  });
});

describe("formatCandidateDate", () => {
  test("shows a bare date for local midnight with no end", () => {
    expect(formatCandidateDate(fromDateInput("2026-03-01"))).toBe("2026-03-01");
  });

  test("shows the start time when one is set", () => {
    expect(formatCandidateDate(fromDateInput("2026-03-01", "19:30"))).toBe("2026-03-01 19:30");
  });

  test("shows a same-day end as a time window", () => {
    expect(
      formatCandidateDate(fromDateInput("2026-03-01", "19:30"), fromDateInput("2026-03-01", "21:00")),
    ).toBe("2026-03-01 19:30–21:00");
  });

  test("spells out an end that falls on another day", () => {
    expect(
      formatCandidateDate(fromDateInput("2026-03-01", "22:00"), fromDateInput("2026-03-02", "01:00")),
    ).toBe("2026-03-01 22:00–2026-03-02 01:00");
  });
});
