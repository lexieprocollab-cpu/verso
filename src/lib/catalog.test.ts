import { describe, expect, it } from "vitest";
import { songsFromRows } from "./catalog";

describe("songs from the database", () => {
  it("builds a playable song with timings, translations, glossary and audio", () => {
    const [song, ...rest] = songsFromRows(
      {
        songs: [
          { id: "petite-mer", title: "Petite Mer", artist: "Cleo", language: "fr", speech_lang: null, level: "beginner", duration_sec: "42.00", audio_path: "u/a.mp3", license: "artist-upload", artists: { slug: "cleo" } },
          { id: "no-lyrics", title: "x", artist: "y", language: "fr", speech_lang: null, level: "beginner", duration_sec: 10, audio_path: null, license: "x", artists: null },
          { id: "video-song", title: "v", artist: "y", language: "es", speech_lang: null, level: "beginner", duration_sec: 10, audio_path: null, youtube_id: "dQw4w9WgXcQ", license: "licensed", artists: null },
        ],
        lines: [
          { song_id: "petite-mer", idx: 1, start_sec: "4.00", end_sec: "7.00", text: "La mer chante" },
          { song_id: "petite-mer", idx: 0, start_sec: 1, end_sec: 4, text: "Je marche" },
          { song_id: "video-song", idx: 0, start_sec: 1, end_sec: 4, text: "Hola" },
        ],
        words: [
          { song_id: "petite-mer", line_idx: 0, word_idx: 1, start_sec: 2, end_sec: 4 },
          { song_id: "petite-mer", line_idx: 0, word_idx: 0, start_sec: 1, end_sec: 2 },
        ],
        translations: [{ song_id: "petite-mer", line_idx: 0, language: "en", text: "I walk" }],
        glossary: [{ song_id: "petite-mer", word_key: "mer", language: "en", meaning: "sea", lemma: null, note: "feminine" }],
      },
      (path) => `https://cdn.test/${path}`,
    );
    expect(rest.map((s) => [s.id, s.youtubeId, s.audioUrl])).toEqual([["video-song", "dQw4w9WgXcQ", undefined]]);
    expect(song).toMatchObject({
      id: "petite-mer",
      artistSlug: "cleo",
      speechLang: "fr-FR",
      duration: 42,
      audioUrl: "https://cdn.test/u/a.mp3",
      glossary: { mer: { meanings: { en: "sea" }, note: "feminine" } },
    });
    expect(song.lines.map((l) => l.text)).toEqual(["Je marche", "La mer chante"]);
    expect(song.lines[0]).toMatchObject({ start: 1, end: 4, translations: { en: "I walk" }, words: [{ start: 1, end: 2 }, { start: 2, end: 4 }] });
    expect(song.lines[1].words).toBeUndefined();
  });
});
