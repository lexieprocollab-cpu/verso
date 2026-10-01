import { tokenize, type Song } from "./song";

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function previousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/**
 * Days in a row with activity, ending today — or ending yesterday if the
 * learner hasn't practiced yet today (the streak isn't lost until tonight).
 */
export function streak(activeDays: readonly string[], today: string): number {
  const days = new Set(activeDays);
  let day = days.has(today) ? today : previousDay(today);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = previousDay(day);
  }
  return count;
}

/** Distinct word keys in a song's lyrics. */
export function songWordKeys(song: Song): string[] {
  const keys = new Set<string>();
  for (const line of song.lines) for (const token of tokenize(line.text)) if (token.isWord) keys.add(token.key);
  return [...keys];
}

/** Share of the song's distinct words the learner knows, 0–100. */
export function understoodPercent(song: Song, isWordKnown: (key: string) => boolean): number {
  const keys = songWordKeys(song);
  if (keys.length === 0) return 0;
  return Math.round((keys.filter(isWordKnown).length / keys.length) * 100);
}
