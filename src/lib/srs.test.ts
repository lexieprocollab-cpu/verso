import { describe, expect, it } from "vitest";
import { demoSong } from "@/content/demoSong";
import { quizFromAi } from "./ai/quizFromAi";
import { dayKey, songWordKeys, streak, understoodPercent } from "./progress";
import { isDue, isKnown, schedule, type ReviewState } from "./srs";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 30, 12);

describe("spaced repetition", () => {
  it("spaces good answers out: 1, 3, then growing", () => {
    let state: ReviewState | undefined;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = schedule(state, "good", now);
      intervals.push(state.interval);
    }
    expect(intervals.slice(0, 2)).toEqual([1, 3]);
    for (let i = 2; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });

  it("brings a forgotten word back in minutes and resets progress", () => {
    const learned = schedule(schedule(schedule(undefined, "good", now), "good", now), "good", now);
    const forgot = schedule(learned, "again", now);
    expect(forgot.reps).toBe(0);
    expect(forgot.due - now).toBeLessThan(DAY);
    expect(forgot.ease).toBeLessThan(learned.ease);
  });

  it("knows when a word is due and when it is known", () => {
    expect(isDue(undefined, now)).toBe(true);
    const next = schedule(undefined, "good", now);
    expect(isDue(next, now)).toBe(false);
    expect(isDue(next, now + DAY)).toBe(true);
    expect(isKnown(next)).toBe(false);
    expect(isKnown({ interval: 30, ease: 2.5, reps: 5, due: now })).toBe(true);
  });
});

describe("progress", () => {
  it("counts a streak ending today or yesterday", () => {
    expect(streak(["2026-09-28", "2026-09-29", "2026-09-30"], "2026-09-30")).toBe(3);
    expect(streak(["2026-09-28", "2026-09-29"], "2026-09-30")).toBe(2);
    expect(streak(["2026-09-27"], "2026-09-30")).toBe(0);
    expect(streak(["2026-02-28", "2026-03-01"], "2026-03-01")).toBe(2);
  });

  it("formats local days", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("measures how much of a song is understood", () => {
    const keys = songWordKeys(demoSong);
    expect(keys).toContain("didn't");
    expect(understoodPercent(demoSong, () => false)).toBe(0);
    expect(understoodPercent(demoSong, () => true)).toBe(100);
    const half = new Set(keys.slice(0, Math.floor(keys.length / 2)));
    expect(understoodPercent(demoSong, (k) => half.has(k))).toBeGreaterThan(40);
  });
});

describe("quizFromAi", () => {
  const lines = demoSong.lines.map((l) => l.text);
  const base = { question: "", question_translation: "", choices: [], line: -1, answer: "", options: [] };

  it("keeps valid items and maps picture keys to pictures", () => {
    const items = quizFromAi(
      {
        items: [
          {
            ...base,
            kind: "picture",
            question: "Who did I meet?",
            question_translation: "Кого я встретил?",
            choices: [
              { text: "boy", picture: "boy", correct: false },
              { text: "girl", picture: "girl", correct: true },
              { text: "dog", picture: "dog", correct: false },
            ],
          },
          { ...base, kind: "fill", line: 1, answer: "Warm", options: ["cold", "warm", "blue"] },
          { ...base, kind: "order", line: 2 },
        ],
      },
      lines,
      "ru",
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ kind: "picture", translations: { ru: "Кого я встретил?" } });
    expect(items[0].kind === "picture" && items[0].choices[1]).toEqual({ emoji: "👧", word: "girl", correct: true });
    expect(items[1]).toEqual({ kind: "fill", line: 1, answer: "warm", options: ["cold", "warm", "blue"] });
  });

  it("drops items that don't match the lyrics", () => {
    const items = quizFromAi(
      {
        items: [
          { ...base, kind: "fill", line: 1, answer: "hot", options: ["hot", "cold"] },
          { ...base, kind: "fill", line: 99, answer: "warm", options: ["warm", "cold"] },
          { ...base, kind: "order", line: 42 },
          {
            ...base,
            kind: "choice",
            question: "Which?",
            choices: [
              { text: "a", picture: "none", correct: true },
              { text: "b", picture: "none", correct: true },
            ],
          },
          {
            ...base,
            kind: "picture",
            question: "Who?",
            choices: [
              { text: "x", picture: "none", correct: true },
              { text: "y", picture: "dog", correct: false },
            ],
          },
        ],
      },
      lines,
      "ru",
    );
    expect(items).toEqual([]);
  });
});
