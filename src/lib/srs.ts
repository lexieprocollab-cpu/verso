// Spaced repetition (a light SM-2): each answer moves the word's next review
// further out when you know it and brings it back soon when you don't.

export type Grade = "again" | "hard" | "good" | "easy";

export type ReviewState = {
  /** Days until the next review after the last answer (0 = later today). */
  interval: number;
  ease: number;
  /** Successful reviews in a row. */
  reps: number;
  /** When the word is next due, epoch ms. */
  due: number;
};

const DAY = 24 * 60 * 60 * 1000;
const AGAIN_DELAY = 10 * 60 * 1000;
const MIN_EASE = 1.3;
/** A word counts as known once its next review is three weeks away. */
export const KNOWN_INTERVAL = 21;

export function schedule(previous: ReviewState | undefined, grade: Grade, now: number): ReviewState {
  const state = previous ?? { interval: 0, ease: 2.5, reps: 0, due: now };

  if (grade === "again") {
    return { interval: 0, ease: Math.max(MIN_EASE, state.ease - 0.2), reps: 0, due: now + AGAIN_DELAY };
  }

  let interval: number;
  if (state.reps === 0) interval = 1;
  else if (state.reps === 1) interval = 3;
  else interval = Math.round(state.interval * state.ease);

  let ease = state.ease;
  if (grade === "hard") {
    interval = Math.max(1, Math.round(Math.max(state.interval, 1) * 1.2));
    ease = Math.max(MIN_EASE, ease - 0.15);
  } else if (grade === "easy") {
    interval = Math.round(interval * 1.3) + 1;
    ease += 0.15;
  }

  return { interval, ease, reps: state.reps + 1, due: now + interval * DAY };
}

export function isDue(state: ReviewState | undefined, now: number): boolean {
  return !state || state.due <= now;
}

export function isKnown(state: ReviewState | undefined): boolean {
  return Boolean(state && state.interval >= KNOWN_INTERVAL);
}
