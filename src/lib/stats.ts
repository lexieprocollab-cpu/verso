import { createLocalStore, parseJson } from "./localStore";
import { dayKey } from "./progress";
import type { DayAnswers, DayCounts } from "./statsMath";

// Advanced stats (step 30): listening time and review answers per day, kept
// on the device like the rest of the learner's progress.

const isDayCounts = (value: unknown): value is DayCounts =>
  typeof value === "object" && value !== null && Object.values(value).every((v) => typeof v === "number");
const isDayAnswers = (value: unknown): value is DayAnswers =>
  typeof value === "object" && value !== null && Object.values(value).every((v) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number"));

/** Seconds of music played per local day. */
export const listeningStore = createLocalStore<DayCounts>("verso.listening", {}, (raw) => parseJson(raw, {}, isDayCounts));
/** Review answers per local day: [answered, correct]. */
export const reviewLogStore = createLocalStore<DayAnswers>("verso.reviewLog", {}, (raw) => parseJson(raw, {}, isDayAnswers));

const KEEP_DAYS = 400;
const trim = <T,>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)).slice(-KEEP_DAYS));

export function addListening(seconds: number, date = new Date()) {
  const day = dayKey(date);
  const log = listeningStore.get();
  listeningStore.set(trim({ ...log, [day]: (log[day] ?? 0) + seconds }));
}

export function logReviewAnswer(correct: boolean, date = new Date()) {
  const day = dayKey(date);
  const log = reviewLogStore.get();
  const [total, right] = log[day] ?? [0, 0];
  reviewLogStore.set(trim({ ...log, [day]: [total + 1, right + (correct ? 1 : 0)] }));
}

export { accuracy, dueForecast, lastDays, minutesPerDay } from "./statsMath";
