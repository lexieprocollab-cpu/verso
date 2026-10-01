import { describe, expect, it } from "vitest";
import { demoSong } from "@/content/demoSong";
import { UI_LANGUAGES } from "./i18n";
import {
  buildTiming,
  findPhrases,
  lineIndexAt,
  lookupGloss,
  phraseKey,
  lineWords,
  scramble,
  slugify,
  tokenize,
  wordIndexAt,
  wordKey,
  wordsBetween,
  type LyricLine,
} from "./song";

const line: LyricLine = { start: 10, end: 14, text: "I met a girl, she said hello", translations: {} };

describe("tokenize", () => {
  it("keeps every character and marks words", () => {
    const tokens = tokenize("That's how, I learned!");
    expect(tokens.map((t) => t.text).join("")).toBe("That's how, I learned!");
    expect(tokens.filter((t) => t.isWord).map((t) => t.key)).toEqual(["that's", "how", "i", "learned"]);
  });

  it("normalizes curly apostrophes and case", () => {
    expect(wordKey("Didn’t")).toBe("didn't");
    expect(wordKey("Hello,")).toBe("hello");
  });

  it("handles Hebrew and Cyrillic words", () => {
    expect(lineWords("שרנו שיר, שלא הכרנו")).toEqual(["שרנו", "שיר", "שלא", "הכרנו"]);
    expect(lineWords("Мы пели песню")).toEqual(["Мы", "пели", "песню"]);
  });
});

describe("timing", () => {
  const lines: LyricLine[] = [line, { ...line, start: 14, end: 18 }];

  it("finds the playing line", () => {
    expect(lineIndexAt(lines, 5)).toBe(-1);
    expect(lineIndexAt(lines, 10)).toBe(0);
    expect(lineIndexAt(lines, 15)).toBe(1);
    expect(lineIndexAt(lines, 99)).toBe(1);
  });

  it("spreads words evenly across the line", () => {
    expect(wordIndexAt(line, 9.9)).toBe(-1);
    expect(wordIndexAt(line, 10)).toBe(0);
    expect(wordIndexAt(line, 13.99)).toBe(6);
    expect(wordIndexAt(line, 14)).toBe(-1);
  });
});

describe("buildTiming", () => {
  const texts = ["I met a girl", "", "she said hello"];

  it("waits until every word has a tap", () => {
    expect(buildTiming(texts, [1, 2, 3], 20)).toBeNull();
  });

  it("turns taps into lines and word timings", () => {
    const lines = buildTiming(texts, [1, 1.5, 2, 2.4, 10, 10.6, 11.2], 20)!;
    expect(lines).toHaveLength(2); // the empty line is skipped
    expect(lines[0]).toMatchObject({ text: "I met a girl", start: 1 });
    expect(lines[0].words).toEqual([
      { start: 1, end: 1.5 },
      { start: 1.5, end: 2 },
      { start: 2, end: 2.4 },
      { start: 2.4, end: 4.9 }, // capped: the pause before line 2 stays dark
    ]);
    expect(lines[0].end).toBe(4.9);
    expect(lines[1]).toMatchObject({ start: 10, end: 13.7 });
  });

  it("drives the word highlight", () => {
    const [line] = buildTiming(["I met a girl"], [1, 1.5, 2, 2.4], 3)!;
    expect(wordIndexAt(line, 1.2)).toBe(0);
    expect(wordIndexAt(line, 2.1)).toBe(2);
    expect(wordIndexAt(line, 2.9)).toBe(3);
  });
});

describe("slugify", () => {
  it("makes URL-safe ids", () => {
    expect(slugify("Down to the Sea!")).toBe("down-to-the-sea");
    expect(slugify("Ça va très bien")).toBe("ca-va-tres-bien");
    expect(slugify("שיר")).toMatch(/^song-/);
  });
});

describe("scramble", () => {
  it("never returns the original order", () => {
    for (const words of [["a", "b"], ["a", "b", "c"], lineWords(line.text)]) {
      const shuffled = scramble(words);
      expect(shuffled).not.toEqual(words);
      expect([...shuffled].sort()).toEqual([...words].sort());
    }
  });
});

describe("demo song content", () => {
  it("has a translation of every line in every other language", () => {
    for (const l of demoSong.lines) {
      for (const lang of UI_LANGUAGES.filter((code) => code !== demoSong.language)) {
        expect(l.translations[lang], `${lang}: ${l.text}`).toBeTruthy();
      }
    }
  });

  it("has a dictionary entry with all meanings for every lyric word", () => {
    for (const l of demoSong.lines) {
      for (const word of lineWords(l.text)) {
        const gloss = demoSong.glossary[wordKey(word)];
        expect(gloss, word).toBeDefined();
        for (const lang of UI_LANGUAGES.filter((code) => code !== demoSong.language)) {
          expect(gloss.meanings[lang], `${lang}: ${word}`).toBeTruthy();
        }
      }
    }
  });

  it("has well-formed quiz items", () => {
    for (const item of demoSong.quiz) {
      if (item.kind === "picture" || item.kind === "choice") {
        expect(item.choices.filter((c) => c.correct)).toHaveLength(1);
      } else {
        expect(demoSong.lines[item.line]).toBeDefined();
      }
      if (item.kind === "picture") {
        for (const c of item.choices) expect(demoSong.glossary[wordKey(c.word)], c.word).toBeDefined();
      }
      if (item.kind === "fill") {
        expect(lineWords(demoSong.lines[item.line].text)).toContain(item.answer);
        expect(item.options).toContain(item.answer);
      }
    }
  });
});

describe("phrases", () => {
  const phrases = { "for free": {}, "down to": {}, "down to the sea": {}, "that's how": {} };

  it("builds phrase keys from words", () => {
    expect(phraseKey("For free!")).toBe("for free");
    expect(phraseKey("That’s how")).toBe("that's how");
  });

  it("finds known phrases, longest first", () => {
    expect(findPhrases("I walked my dog down to the sea", phrases)).toEqual([{ key: "down to the sea", from: 4, to: 7 }]);
    expect(findPhrases("That's how I learned to sing for free", phrases)).toEqual([
      { key: "that's how", from: 0, to: 1 },
      { key: "for free", from: 6, to: 7 },
    ]);
    expect(findPhrases("free for all", phrases)).toEqual([]);
    expect(findPhrases("anything", undefined)).toEqual([]);
  });

  it("reads a selected range in either direction", () => {
    expect(wordsBetween("I met a girl, she said hello", 5, 6)).toBe("said hello");
    expect(wordsBetween("I met a girl, she said hello", 6, 5)).toBe("said hello");
  });

  it("looks up words and phrases", () => {
    expect(lookupGloss(demoSong, "for free")?.meanings.ru).toBeTruthy();
    expect(lookupGloss(demoSong, "dog")?.meanings.ru).toBe("собака");
  });
});

describe("demo song phrases", () => {
  it("every phrase appears in the lyrics and has all meanings", () => {
    for (const [key, gloss] of Object.entries(demoSong.phrases ?? {})) {
      expect(demoSong.lines.some((l) => findPhrases(l.text, { [key]: gloss }).length > 0), key).toBe(true);
      for (const lang of UI_LANGUAGES.filter((code) => code !== demoSong.language)) {
        expect(gloss.meanings[lang], `${lang}: ${key}`).toBeTruthy();
      }
    }
  });
});

describe("Arabic and Hebrew words", () => {
  it("keeps vowel marks inside words and ignores them in keys", () => {
    const tokens = tokenize("كَتَبَ الوَلَدُ، ثم كتب");
    expect(tokens.filter((t) => t.isWord).map((t) => t.text)).toEqual(["كَتَبَ", "الوَلَدُ", "ثم", "كتب"]);
    expect(wordKey("كَتَبَ")).toBe(wordKey("كتب"));
    expect(wordKey("שִׁיר")).toBe("שיר");
    expect(lineWords("Grüße aus Köln")).toEqual(["Grüße", "aus", "Köln"]);
  });
});
