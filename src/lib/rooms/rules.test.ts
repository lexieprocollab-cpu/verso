import { describe, expect, it } from "vitest";
import { demoSong } from "@/content/demoSong";
import {
  challengeIndex,
  challengeWinner,
  checkMessage,
  containsBlockedWord,
  isAdult,
  isOldEnough,
  outsideWords,
  songVocabulary,
} from "./rules";

const vocab = songVocabulary(demoSong);

describe("song words only", () => {
  it("builds the song's vocabulary", () => {
    expect(vocab.has("sea")).toBe(true);
    expect(vocab.has("didn't")).toBe(true);
    expect(vocab.has("pizza")).toBe(false);
  });

  it("finds words outside the song", () => {
    expect(outsideWords("I met a dog", vocab)).toEqual([]);
    expect(outsideWords("I love pizza and pizza!", vocab)).toEqual(["love", "pizza"]);
    expect(outsideWords("The SEA was warm.", vocab)).toEqual([]);
  });

  it("checks a message for the mode", () => {
    expect(checkMessage("  ", "free", vocab)).toBe("empty");
    expect(checkMessage("!!!", "free", vocab)).toBe("empty");
    expect(checkMessage("I love pizza", "free", vocab)).toBeNull();
    expect(checkMessage("I love pizza", "song", vocab)).toBe("outside_words");
    expect(checkMessage("we sang a song to the sea", "song", vocab)).toBeNull();
    expect(checkMessage("a".repeat(301), "free", vocab)).toBe("too_long");
  });
});

describe("profanity filter", () => {
  it("blocks listed words in any language, whole words only", () => {
    expect(containsBlockedWord("what the Fuck")).toBe(true);
    expect(containsBlockedWord("ты сука")).toBe(true);
    expect(containsBlockedWord("זה בן זונה")).toBe(true);
    expect(containsBlockedWord("I like the sea")).toBe(false);
    expect(containsBlockedWord("Dickens wrote books")).toBe(false);
    expect(checkMessage("shit", "free", vocab)).toBe("blocked_word");
  });
});

describe("age gate", () => {
  const now = new Date(2026, 8, 30); // 30 Sep 2026

  it("allows 13 from the birth month on", () => {
    expect(isOldEnough(2013, 9, now)).toBe(true);
    expect(isOldEnough(2013, 10, now)).toBe(false);
    expect(isOldEnough(2014, 1, now)).toBe(false);
    expect(isOldEnough(1990, 12, now)).toBe(true);
  });

  it("knows who is an adult", () => {
    expect(isAdult(2008, 9, now)).toBe(true);
    expect(isAdult(2008, 10, now)).toBe(false);
  });
});

describe("daily challenge", () => {
  it("is the same for everyone on a day and changes between days", () => {
    expect(challengeIndex("song", "2026-09-30", 7)).toBe(challengeIndex("song", "2026-09-30", 7));
    const week = ["01", "02", "03", "04", "05", "06", "07"].map((d) => challengeIndex("song", `2026-10-${d}`, 7));
    expect(new Set(week).size).toBeGreaterThan(1);
    for (const i of week) expect(i).toBeGreaterThanOrEqual(0);
  });

  it("picks the most-voted entry, earliest on a tie", () => {
    const entries = [
      { id: "a", createdAt: 1 },
      { id: "b", createdAt: 2 },
      { id: "c", createdAt: 3 },
    ];
    const vote = (messageId: string, voterId: string) => ({ messageId, voterId });
    expect(challengeWinner(entries, [])).toBeNull();
    expect(challengeWinner(entries, [vote("b", "1"), vote("c", "2"), vote("c", "3")])?.id).toBe("c");
    expect(challengeWinner(entries, [vote("b", "1"), vote("a", "2")])?.id).toBe("a");
  });
});
