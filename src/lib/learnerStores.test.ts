import { describe, expect, it } from "vitest";
import { matchesSearch, wordStatus } from "./learnerStores";

const review = (interval: number, reps: number) => ({ interval, ease: 2.5, reps, due: 0 });

describe("My Words helpers", () => {
  it("derives a word's status", () => {
    expect(wordStatus("s:dog", [], {})).toBe("new");
    expect(wordStatus("s:dog", [], { "s:dog": review(3, 2) })).toBe("learning");
    expect(wordStatus("s:dog", [], { "s:dog": review(30, 6) })).toBe("known");
    expect(wordStatus("s:dog", ["s:dog"], {})).toBe("known");
    expect(wordStatus("s:dog", [], { "s:dog": review(0, 0) })).toBe("new");
  });

  it("searches word, meaning and note, ignoring case and accents", () => {
    expect(matchesSearch("", "dog")).toBe(true);
    expect(matchesSearch("DOG", "dog")).toBe(true);
    expect(matchesSearch("соба", "dog", "собака")).toBe(true);
    expect(matchesSearch("cafe", "café")).toBe(true);
    expect(matchesSearch("beach", "dog", "собака", "my note about the sea")).toBe(false);
    expect(matchesSearch("sea", "dog", undefined, "my note about the sea")).toBe(true);
  });
});
