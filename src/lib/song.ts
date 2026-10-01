import type { UiLanguage } from "./i18n";

export type Translations = Partial<Record<UiLanguage, string>>;

export type LyricLine = {
  /** Seconds from the start of the song. */
  start: number;
  end: number;
  text: string;
  translations: Translations;
  /** Start/end of each word (in lineWords order), from the song timing tool. */
  words?: WordTiming[];
};

export type WordTiming = { start: number; end: number };

export type Gloss = {
  /** Dictionary form when it differs from the word, e.g. "walk" for "walked". */
  lemma?: string;
  /** Short grammar note, written in the song's language. */
  note?: string;
  meanings: Translations;
};

export type QuizItem =
  | {
      kind: "picture";
      question: string;
      translations: Translations;
      choices: { emoji: string; word: string; correct?: boolean }[];
    }
  | {
      kind: "choice";
      question: string;
      translations: Translations;
      choices: { text: string; correct?: boolean }[];
    }
  | { kind: "fill"; line: number; answer: string; options: string[] }
  | { kind: "order"; line: number };

export type Song = {
  id: string;
  title: string;
  artist: string;
  /** Artist page (/artists/<slug>) for songs uploaded by the artist. */
  artistSlug?: string;
  language: UiLanguage;
  /** BCP 47 tag for text-to-speech, e.g. "en-US". */
  speechLang: string;
  level: "beginner" | "intermediate" | "advanced";
  duration: number;
  /** Audio file URL; songs without audio play on a timer. */
  audioUrl?: string;
  /** Official YouTube video to play instead of an audio file (licensed songs, step 29). */
  youtubeId?: string;
  /** Where the song may be used from, e.g. "CC-BY-4.0" or "original". */
  license?: string;
  /** Free songs don't count toward the 3-song trial (the demo). */
  free?: boolean;
  lines: LyricLine[];
  glossary: Record<string, Gloss>;
  /** Multi-word expressions keyed by their word keys joined with spaces, e.g. "for free". */
  phrases?: Record<string, Gloss>;
  quiz: QuizItem[];
};

/** Default text-to-speech voice per song language. */
export const SPEECH_LANG: Record<UiLanguage, string> = {
  en: "en-US",
  fr: "fr-FR",
  he: "he-IL",
  es: "es-ES",
  uk: "uk-UA",
  ru: "ru-RU",
  de: "de-DE",
  ar: "ar-SA",
};

export type Token = { text: string; key: string; isWord: boolean };

/** Lookup key for a word: lowercase, straight apostrophes, no surrounding punctuation. */
export function wordKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    // Vowel marks are optional in Arabic and Hebrew: كَتَبَ and كتب are the same word.
    .replace(/[\u0591-\u05C7\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Splits text into word and non-word tokens, keeping every character. */
export function tokenize(text: string): Token[] {
  // Marks (\p{M}) stay inside a word: Arabic harakat, Hebrew niqqud, combining accents.
  const parts = text.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*|[^\p{L}\p{N}]+/gu) ?? [];
  return parts.map((part) => {
    const isWord = /^[\p{L}\p{N}]/u.test(part);
    return { text: part, key: isWord ? wordKey(part) : "", isWord };
  });
}

/** Words of a line, without punctuation. */
export function lineWords(text: string): string[] {
  return tokenize(text)
    .filter((token) => token.isWord)
    .map((token) => token.text);
}

/** Index of the line playing at `time`, or -1 before the first line starts. */
export function lineIndexAt(lines: LyricLine[], time: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (time >= lines[i].start) index = i;
    else break;
  }
  return index;
}

/**
 * Index (among the line's words) of the word being sung at `time`: from
 * per-word timings when the song has them, otherwise by spreading the line's
 * duration evenly over its words. Returns -1 outside the line.
 */
export function wordIndexAt(line: LyricLine, time: number): number {
  if (time < line.start || time >= line.end) return -1;
  if (line.words?.length) {
    let index = -1;
    line.words.forEach((word, i) => {
      if (time >= word.start) index = i;
    });
    return index;
  }
  const count = lineWords(line.text).length;
  if (count === 0) return -1;
  const progress = (time - line.start) / (line.end - line.start);
  return Math.min(count - 1, Math.floor(progress * count));
}

/**
 * Deterministic shuffle that never returns the original order (for arrays of
 * two or more distinct items), so "put the words in order" is always a task.
 */
export function scramble<T>(items: T[]): T[] {
  if (items.length < 2) return [...items];
  const out = [...items];
  // Interleave from both ends: [a b c d e] -> [e a d b c]
  const result: T[] = [];
  while (out.length) {
    result.push(out.pop() as T);
    if (out.length) result.push(out.shift() as T);
  }
  const same = result.every((item, i) => item === items[i]);
  return same ? [...items.slice(1), items[0]] : result;
}

/** First line containing the word, or null if the word is not in the lyrics. */
export function lineOfWord(song: Song, key: string): number | null {
  const index = song.lines.findIndex((line) => tokenize(line.text).some((token) => token.key === key));
  return index === -1 ? null : index;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Longest a word may hold before the singer pauses (a word stays lit for at most this long). */
export const MAX_WORD_SECONDS = 2.5;

/**
 * Builds timed lyric lines from taps: one tap per word, in singing order,
 * marking when that word starts. A word ends when the next one starts, but
 * never later than MAX_WORD_SECONDS, so pauses between lines stay dark.
 * Returns null until every word has a tap.
 */
export function buildTiming(texts: string[], taps: number[], duration: number): LyricLine[] | null {
  const wordsPerLine = texts.map((text) => lineWords(text).length);
  const total = wordsPerLine.reduce((a, b) => a + b, 0);
  if (total === 0 || taps.length < total) return null;

  const starts = taps.slice(0, total);
  const ends = starts.map((start, i) => {
    const next = i + 1 < starts.length ? starts[i + 1] : duration;
    return Math.max(start + 0.05, Math.min(next, start + MAX_WORD_SECONDS));
  });

  let cursor = 0;
  return texts.flatMap((text, i) => {
    const count = wordsPerLine[i];
    if (count === 0) return [];
    const words = starts.slice(cursor, cursor + count).map((start, j) => ({
      start: round(start),
      end: round(ends[cursor + j]),
    }));
    cursor += count;
    return [{ start: words[0].start, end: words[words.length - 1].end, text, translations: {}, words }];
  });
}

function round(seconds: number) {
  return Math.round(seconds * 100) / 100;
}

/** URL-safe id from a title, e.g. "Down to the Sea!" → "down-to-the-sea". */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `song-${Date.now().toString(36)}`;
}

/** Lookup key for a phrase: its word keys joined by single spaces. */
export function phraseKey(text: string): string {
  return tokenize(text)
    .filter((token) => token.isWord)
    .map((token) => token.key)
    .join(" ");
}

export type PhraseSpan = { key: string; from: number; to: number };

/**
 * Known phrases in a line, as word-index ranges (inclusive). Longer phrases
 * win where two overlap, e.g. "down to the sea" over "down to".
 */
export function findPhrases(text: string, phrases: Record<string, unknown> | undefined): PhraseSpan[] {
  if (!phrases) return [];
  const keys = tokenize(text)
    .filter((token) => token.isWord)
    .map((token) => token.key);
  const candidates: PhraseSpan[] = [];
  for (const key of Object.keys(phrases)) {
    const parts = key.split(" ");
    for (let i = 0; i + parts.length <= keys.length; i++) {
      if (parts.every((part, j) => keys[i + j] === part)) candidates.push({ key, from: i, to: i + parts.length - 1 });
    }
  }
  candidates.sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from);
  const taken = new Set<number>();
  const spans: PhraseSpan[] = [];
  for (const span of candidates) {
    const indexes = Array.from({ length: span.to - span.from + 1 }, (_, k) => span.from + k);
    if (indexes.some((i) => taken.has(i))) continue;
    indexes.forEach((i) => taken.add(i));
    spans.push(span);
  }
  return spans.sort((a, b) => a.from - b.from);
}

/** Words from..to (inclusive, by word index) of a line, as written. */
export function wordsBetween(text: string, from: number, to: number): string {
  const [start, end] = from <= to ? [from, to] : [to, from];
  return lineWords(text).slice(start, end + 1).join(" ");
}

/** Dictionary entry for a saved word or phrase key. */
export function lookupGloss(song: Song, key: string): Gloss | undefined {
  return key.includes(" ") ? song.phrases?.[key] : song.glossary[key];
}
