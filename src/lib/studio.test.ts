import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, draftLines, draftWordCount, songFromDraft, type StudioDraft } from "./studio";

const draft: StudioDraft = {
  ...EMPTY_DRAFT,
  title: "Petite Chanson",
  artist: "Indie Band",
  language: "fr",
  license: "CC-BY-4.0",
  lyrics: "Je chante\n\n  ...  \nla mer bleue\n",
  taps: [1, 1.6, 5, 5.5, 6],
  translations: { en: ["I sing", "the blue sea"] },
};

describe("song timing tool", () => {
  it("ignores empty and punctuation-only lines", () => {
    expect(draftLines(draft)).toEqual(["Je chante", "la mer bleue"]);
    expect(draftWordCount(draft)).toBe(5);
  });

  it("builds a playable song", () => {
    const result = songFromDraft(draft, 10, "https://cdn.example/song.mp3");
    expect(result.missing).toEqual([]);
    const song = result.song!;
    expect(song).toMatchObject({ id: "petite-chanson-indie-band", language: "fr", speechLang: "fr-FR", duration: 10 });
    expect(song.lines).toHaveLength(2);
    expect(song.lines[0]).toMatchObject({ text: "Je chante", start: 1, translations: { en: "I sing" } });
    expect(song.lines[1].words).toHaveLength(3);
  });

  it("lists what's missing", () => {
    const result = songFromDraft({ ...draft, title: "", taps: [1], translations: { en: ["I sing", ""] } }, 10, undefined);
    expect(result.song).toBeNull();
    expect(result.missing).toEqual(["title", "timing", "translation:en"]);
  });
});
