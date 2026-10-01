import { describe, expect, it } from "vitest";
import { accuracy, dueForecast, lastDays, minutesPerDay } from "./stats";

const today = new Date(2026, 8, 30, 15, 0);

describe("advanced stats", () => {
  it("lists the last days across a month boundary", () => {
    expect(lastDays(3, new Date(2026, 9, 1))).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });

  it("turns seconds into minutes per day", () => {
    expect(minutesPerDay({ "2026-09-29": 150, "2026-09-30": 29 }, lastDays(3, today))).toEqual([0, 3, 0]);
  });

  it("computes review accuracy over a window", () => {
    const log: Record<string, [number, number]> = { "2026-09-29": [4, 3], "2026-09-30": [6, 6], "2026-08-01": [10, 0] };
    expect(accuracy(log, lastDays(7, today))).toBe(90);
    expect(accuracy({}, lastDays(7, today))).toBeNull();
  });

  it("forecasts reviews for the next week, counting overdue words today", () => {
    const at = (days: number) => new Date(2026, 8, 30 + days, 9).getTime();
    const reviews = {
      a: { interval: 1, ease: 2.5, reps: 1, due: at(-3) },
      b: { interval: 1, ease: 2.5, reps: 1, due: at(0) },
      c: { interval: 3, ease: 2.5, reps: 2, due: at(2) },
      d: { interval: 30, ease: 2.5, reps: 5, due: at(30) },
    };
    expect(dueForecast(reviews, today)).toEqual([2, 0, 1, 0, 0, 0, 0]);
  });
});
