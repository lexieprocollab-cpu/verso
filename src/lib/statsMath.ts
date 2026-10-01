import { dayKey } from "./progress";
import type { ReviewState } from "./srs";

// Stats math shared by the web and mobile apps (no storage, no React).

export type DayCounts = Record<string, number>;
export type DayAnswers = Record<string, [total: number, correct: number]>;

/** The last `n` local days, oldest first, ending with `today`. */
export function lastDays(n: number, today: Date): string[] {
  return Array.from({ length: n }, (_, i) => dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1 - i))));
}

/** Minutes listened on each of the given days. */
export function minutesPerDay(log: DayCounts, days: string[]): number[] {
  return days.map((day) => Math.round((log[day] ?? 0) / 60));
}

/** Share of review answers that were right (not "Again") over the given days, 0–100; null without answers. */
export function accuracy(log: DayAnswers, days: string[]): number | null {
  let total = 0;
  let right = 0;
  for (const day of days) {
    total += log[day]?.[0] ?? 0;
    right += log[day]?.[1] ?? 0;
  }
  return total ? Math.round((right / total) * 100) : null;
}

/** Words coming due on each of the next `n` days (today includes anything overdue). */
export function dueForecast(reviews: Record<string, ReviewState>, now: Date, n = 7): number[] {
  const counts = Array.from({ length: n }, () => 0);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const state of Object.values(reviews)) {
    const day = Math.floor((state.due - startOfToday) / 86_400_000);
    if (day < n) counts[Math.max(0, day)]++;
  }
  return counts;
}
