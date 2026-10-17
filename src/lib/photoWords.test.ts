import { describe, expect, it } from "vitest";
import { addPhotoWord, fitWithin, isPhotoWords, markerPosition, photoWordId, removePhotoWord } from "./photoWords";

const cup = {
  word: "la tasse",
  learn: "fr" as const,
  meaningLang: "en" as const,
  reading: "",
  meaning: "the cup",
  definition: "A small container you drink from",
  example: "Je bois un café dans la tasse.",
  exampleMeaning: "I drink a coffee from the cup.",
};

describe("photo words", () => {
  it("ids by language and word, ignoring case and spaces", () => {
    expect(photoWordId("fr", " La Tasse ")).toBe("photo:fr:la tasse");
  });

  it("adds newest first and never twice", () => {
    const one = addPhotoWord([], cup, 1);
    expect(one).toEqual([{ ...cup, id: "photo:fr:la tasse", savedAt: 1 }]);
    expect(addPhotoWord(one, { ...cup, word: "La tasse" }, 2)).toBe(one);
    const two = addPhotoWord(one, { ...cup, word: "le stylo", meaning: "the pen" }, 3);
    expect(two.map((w) => w.word)).toEqual(["le stylo", "la tasse"]);
    expect(addPhotoWord(one, { ...cup, learn: "es", word: "la taza" }, 4)).toHaveLength(2);
  });

  it("removes by id and validates what was stored", () => {
    const words = addPhotoWord([], cup, 1);
    expect(removePhotoWord(words, "photo:fr:la tasse")).toEqual([]);
    expect(isPhotoWords(words)).toBe(true);
    expect(isPhotoWords([{ ...words[0], learn: "it" }])).toBe(false);
    expect(isPhotoWords("nope")).toBe(false);
  });

  it("places markers inside the photo", () => {
    expect(markerPosition({ x: 250, y: 1000 })).toEqual({ left: "25%", top: "100%" });
    expect(markerPosition({ x: -5, y: 2000 })).toEqual({ left: "0%", top: "100%" });
  });

  it("scales big photos down to 1024 on the long side, never up", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
