import { isUiLanguage, type UiLanguage } from "./i18n";

/** A word learned from a photo ("Snap & learn"); kept on the device like saved song words. */
export type PhotoWord = {
  /** Review id, e.g. "photo:fr:la tasse". */
  id: string;
  word: string;
  /** Language of `word`. */
  learn: UiLanguage;
  /** Language of `meaning`, `definition` and `exampleMeaning`. */
  meaningLang: UiLanguage;
  reading: string;
  /** IPA transcription, e.g. "/la tas/" (words saved before it existed have none). */
  ipa?: string;
  meaning: string;
  definition: string;
  example: string;
  exampleMeaning: string;
  savedAt: number;
};

export function photoWordId(learn: UiLanguage, word: string): string {
  return `photo:${learn}:${word.trim().toLowerCase()}`;
}

/** Adds the word (newest first); a word already saved in that language is left as it is. */
export function addPhotoWord(words: PhotoWord[], word: Omit<PhotoWord, "id" | "savedAt">, now = Date.now()): PhotoWord[] {
  const id = photoWordId(word.learn, word.word);
  if (words.some((w) => w.id === id)) return words;
  return [{ ...word, id, savedAt: now }, ...words];
}

export function removePhotoWord(words: PhotoWord[], id: string): PhotoWord[] {
  return words.filter((w) => w.id !== id);
}

function isPhotoWord(value: unknown): value is PhotoWord {
  if (!value || typeof value !== "object") return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.id === "string" &&
    typeof w.word === "string" &&
    isUiLanguage(w.learn) &&
    isUiLanguage(w.meaningLang) &&
    ["reading", "meaning", "definition", "example", "exampleMeaning"].every((k) => typeof w[k] === "string") &&
    (w.ipa === undefined || typeof w.ipa === "string") &&
    typeof w.savedAt === "number"
  );
}

export function isPhotoWords(value: unknown): value is PhotoWord[] {
  return Array.isArray(value) && value.every(isPhotoWord);
}

/** Where to put a marker over the photo, as CSS percentages, from the AI's 0–1000 position. */
export function markerPosition(item: { x: number; y: number }): { left: string; top: string } {
  const pct = (n: number) => `${Math.min(100, Math.max(0, n / 10))}%`;
  return { left: pct(item.x), top: pct(item.y) };
}

/** The longest side photos are scaled down to before sending: enough to name things, small enough to upload fast. */
export const PHOTO_MAX_SIDE = 1024;

/** Width and height that fit within PHOTO_MAX_SIDE, keeping the shape. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * The language a photo item is in: things are named in the language being learned; writing keeps
 * its own language when Verso supports it, else it counts as the language being learned.
 */
export function itemLanguage(item: { kind: "object" | "text"; language: string }, learn: UiLanguage): UiLanguage {
  const code = item.language.trim().toLowerCase().slice(0, 2);
  return item.kind === "text" && isUiLanguage(code) ? code : learn;
}
