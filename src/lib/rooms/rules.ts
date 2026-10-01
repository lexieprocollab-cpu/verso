import type { UiLanguage } from "../i18n";
import { tokenize, type Song } from "../song";

// Song Rooms rules shared by the app (instant feedback) and the server (the
// real check before a message is stored).

export type RoomMode = "free" | "song";

export const MAX_MESSAGE_LENGTH = 300;
export const MIN_AGE = 13;

/** Distinct word keys a song's lyrics use: the only words allowed in song-words-only mode. */
export function songVocabulary(song: Pick<Song, "lines">): Set<string> {
  const words = new Set<string>();
  for (const line of song.lines) for (const token of tokenize(line.text)) if (token.isWord) words.add(token.key);
  return words;
}

/** Words of a message that are not in the song (in order, without repeats). */
export function outsideWords(text: string, vocabulary: ReadonlySet<string>): string[] {
  const outside: string[] = [];
  for (const token of tokenize(text)) {
    if (token.isWord && !vocabulary.has(token.key) && !outside.includes(token.key)) outside.push(token.key);
  }
  return outside;
}

// A short starter list of strong profanity per language. Replace with a
// maintained list or moderation service before a public launch.
const BLOCKED: Record<UiLanguage, string[]> = {
  en: ["fuck", "fucking", "shit", "bitch", "cunt", "asshole", "motherfucker", "dick", "whore", "slut"],
  fr: ["putain", "merde", "connard", "connasse", "salope", "enculé", "pute", "bite"],
  he: ["זונה", "שרמוטה", "מניאק", "כוס", "זין", "בן זונה"],
  es: ["puta", "puto", "mierda", "cabrón", "coño", "gilipollas", "joder", "pendejo"],
  uk: ["блядь", "бля", "хуй", "пизда", "сука", "їбати", "курва", "мудак"],
  ru: ["блядь", "бля", "хуй", "пизда", "сука", "ебать", "мудак", "уебок", "говно"],
  de: ["scheiße", "scheisse", "arschloch", "fotze", "hurensohn", "wichser", "ficken", "fick", "schlampe", "nutte"],
  ar: ["كس", "كسمك", "زب", "شرموطة", "منيوك", "عرص", "خول", "ابن الكلب", "ابن الشرموطة"],
};

const blockedKeys = new Set(Object.values(BLOCKED).flatMap((words) => words.map((w) => w.toLowerCase())));
const blockedPhrases = [...blockedKeys].filter((w) => w.includes(" "));

/** True if the text contains a blocked word in any supported language. */
export function containsBlockedWord(text: string): boolean {
  const lower = text.toLowerCase();
  if (blockedPhrases.some((phrase) => lower.includes(phrase))) return true;
  return tokenize(text).some((token) => token.isWord && blockedKeys.has(token.key));
}

export type MessageProblem = "empty" | "too_long" | "outside_words" | "blocked_word";

export function checkMessage(text: string, mode: RoomMode, vocabulary: ReadonlySet<string>): MessageProblem | null {
  const trimmed = text.trim();
  if (!tokenize(trimmed).some((token) => token.isWord)) return "empty";
  if (trimmed.length > MAX_MESSAGE_LENGTH) return "too_long";
  if (containsBlockedWord(trimmed)) return "blocked_word";
  if (mode === "song" && outsideWords(trimmed, vocabulary).length > 0) return "outside_words";
  return null;
}

/**
 * At least 13 years old, from birth month (1–12) and year. Someone turns 13
 * during their birth month, so that month already counts.
 */
export function isOldEnough(birthYear: number, birthMonth: number, now: Date): boolean {
  const months = (now.getFullYear() - birthYear) * 12 + (now.getMonth() + 1 - birthMonth);
  return months >= MIN_AGE * 12;
}

export function isAdult(birthYear: number, birthMonth: number, now: Date): boolean {
  return (now.getFullYear() - birthYear) * 12 + (now.getMonth() + 1 - birthMonth) >= 18 * 12;
}

/** Daily challenge: which prompt applies to this room today (changes every day, same for everyone). */
export function challengeIndex(roomId: string, day: string, promptCount: number): number {
  let hash = 0;
  for (const char of `${roomId}:${day}`) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % promptCount;
}

export type Vote = { messageId: string; voterId: string };

/** The challenge entry with the most votes (earliest entry wins a tie), or null. */
export function challengeWinner<T extends { id: string; createdAt: number }>(entries: T[], votes: Vote[]): T | null {
  let best: T | null = null;
  let bestVotes = 0;
  for (const entry of [...entries].sort((a, b) => a.createdAt - b.createdAt)) {
    const count = votes.filter((v) => v.messageId === entry.id).length;
    if (count > bestVotes) {
      best = entry;
      bestVotes = count;
    }
  }
  return best;
}
