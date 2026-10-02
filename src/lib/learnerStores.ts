import { isUiLanguage, type UiLanguage } from "./i18n";
import { createLocalStore, parseJson } from "./localStore";
import { logReviewAnswer } from "./stats";
import { dayKey } from "./progress";
import { isKnown, schedule, type Grade, type ReviewState } from "./srs";
import { track } from "./track";

// Kept on the device until sign-in and the database arrive (steps 4 and 13),
// then synced to the account.

export type SavedWord = {
  /** Glossary key, e.g. "walked". */
  key: string;
  /** The word as it appeared, e.g. "Walked". */
  word: string;
  songId: string;
  line: number;
  savedAt: number;
  /** The learner's own note. */
  note?: string;
};

function isSavedWords(value: unknown): value is SavedWord[] {
  return (
    Array.isArray(value) &&
    value.every(
      (w) =>
        typeof w === "object" &&
        w !== null &&
        typeof w.key === "string" &&
        typeof w.word === "string" &&
        typeof w.songId === "string" &&
        typeof w.line === "number",
    )
  );
}

export const savedWordsStore = createLocalStore<SavedWord[]>("verso.savedWords", [], (raw) =>
  parseJson(raw, [], isSavedWords),
);

export function isSaved(words: SavedWord[], songId: string, key: string) {
  return words.some((w) => w.songId === songId && w.key === key);
}

export function saveWord(entry: Omit<SavedWord, "savedAt">) {
  const words = savedWordsStore.get();
  if (isSaved(words, entry.songId, entry.key)) return;
  savedWordsStore.set([{ ...entry, savedAt: Date.now() }, ...words]);
  recordActivity();
  track("word_saved", { song: entry.songId, phrase: entry.key.includes(" ") });
}

/** Identifies a word within a song, e.g. "down-to-the-sea:walked". */
export function wordId(songId: string, key: string) {
  return `${songId}:${key}`;
}

// Review schedule per saved word (spaced repetition).
function isReviewMap(value: unknown): value is Record<string, ReviewState> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(
      (s) => typeof s === "object" && s !== null && ["interval", "ease", "reps", "due"].every((k) => typeof s[k] === "number"),
    )
  );
}

export const reviewsStore = createLocalStore<Record<string, ReviewState>>("verso.reviews", {}, (raw) =>
  parseJson(raw, {}, isReviewMap),
);

export function gradeWord(id: string, grade: Grade) {
  const reviews = reviewsStore.get();
  reviewsStore.set({ ...reviews, [id]: schedule(reviews[id], grade, Date.now()) });
  logReviewAnswer(grade !== "again");
  recordActivity();
  track("review_answered", { grade });
}

// Words the learner marked "I know it".
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export const knownWordsStore = createLocalStore<string[]>("verso.known", [], (raw) => parseJson(raw, [], isStringArray));

export function toggleKnown(id: string) {
  const known = knownWordsStore.get();
  knownWordsStore.set(known.includes(id) ? known.filter((k) => k !== id) : [...known, id]);
  recordActivity();
}

// Days with any learning activity, for the streak.
export const activityStore = createLocalStore<string[]>("verso.activity", [], (raw) => parseJson(raw, [], isStringArray));

export function recordActivity() {
  const today = dayKey(new Date());
  const days = activityStore.get();
  if (days.includes(today)) return;
  activityStore.set([...days, today].slice(-400));
}

export function setWordNote(songId: string, key: string, note: string) {
  const trimmed = note.trim().slice(0, 500);
  savedWordsStore.set(
    savedWordsStore
      .get()
      .map((w) => (w.songId === songId && w.key === key ? { ...w, note: trimmed || undefined } : w)),
  );
}

export type WordStatus = "new" | "learning" | "known";

/** New = never reviewed; learning = in review; known = marked "I know it" or learned in review. */
export function wordStatus(id: string, known: readonly string[], reviews: Record<string, ReviewState>): WordStatus {
  if (known.includes(id) || isKnown(reviews[id])) return "known";
  return reviews[id]?.reps ? "learning" : "new";
}

/** Case- and accent-insensitive search over the word, its meaning and the learner's note. */
export function matchesSearch(query: string, ...fields: (string | undefined)[]): boolean {
  const normalize = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const q = normalize(query.trim());
  return !q || fields.some((field) => field && normalize(field).includes(q));
}

export function removeWord(songId: string, key: string) {
  savedWordsStore.set(savedWordsStore.get().filter((w) => !(w.songId === songId && w.key === key)));
}

export function toggleWord(entry: Omit<SavedWord, "savedAt">) {
  if (isSaved(savedWordsStore.get(), entry.songId, entry.key)) removeWord(entry.songId, entry.key);
  else saveWord(entry);
}

export type TranslationMode = "always" | "tap" | "off";
export type LyricSize = "s" | "m" | "l" | "xl";

export const LYRIC_COLORS = ["default", "violet", "teal", "rose", "amber"] as const;
export type LyricColor = (typeof LYRIC_COLORS)[number];

export type PlayerSettings = {
  /** Language the translations are shown in; null = same as the interface. */
  speak: UiLanguage | null;
  translation: TranslationMode;
  size: LyricSize;
  color: LyricColor;
};

const DEFAULT_SETTINGS: PlayerSettings = { speak: null, translation: "always", size: "m", color: "default" };

function isPlayerSettings(value: unknown): value is PlayerSettings {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.speak === null || isUiLanguage(v.speak)) &&
    (v.translation === "always" || v.translation === "tap" || v.translation === "off") &&
    (v.size === "s" || v.size === "m" || v.size === "l" || v.size === "xl") &&
    typeof v.color === "string" &&
    (LYRIC_COLORS as readonly string[]).includes(v.color)
  );
}

export const playerSettingsStore = createLocalStore<PlayerSettings>("verso.player", DEFAULT_SETTINGS, (raw) =>
  parseJson(raw, DEFAULT_SETTINGS, isPlayerSettings),
);

export function updatePlayerSettings(patch: Partial<PlayerSettings>) {
  playerSettingsStore.set({ ...playerSettingsStore.get(), ...patch });
}

/** Speaks text with the browser's built-in voice; silently does nothing if unsupported. */
export function speak(text: string, lang: string, rate = 0.9) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

/** Stops anything the browser voice is saying. */
export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

// First-visit onboarding: languages and favorite songs.
export type Onboarding = {
  done: boolean;
  /** Language the learner wants to learn. */
  learn: UiLanguage | null;
  /** Catalog songs picked as favorites (ids). */
  favorites: string[];
  /** Songs the learner typed in, to guide which songs we license next. */
  wishes: string[];
};

const NOT_ONBOARDED: Onboarding = { done: false, learn: null, favorites: [], wishes: [] };

function isOnboarding(value: unknown): value is Onboarding {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.done === "boolean" && (v.learn === null || isUiLanguage(v.learn)) && isStringArray(v.favorites) && isStringArray(v.wishes);
}

export const onboardingStore = createLocalStore<Onboarding>("verso.onboarding", NOT_ONBOARDED, (raw) =>
  parseJson(raw, NOT_ONBOARDED, isOnboarding),
);

// Songs started under the free trial, in order.
export const trialSongsStore = createLocalStore<string[]>("verso.trial", [], (raw) => parseJson(raw, [], isStringArray));

export function startTrialSong(songId: string) {
  const songs = trialSongsStore.get();
  if (songs.includes(songId)) return false;
  trialSongsStore.set([...songs, songId]);
  track("trial_song_started", { song: songId, number: songs.length + 1 });
  return true;
}
