import { isUiLanguage, languageFromDevice, type UiLanguage } from "@shared/lib/i18n";
import { dayKey } from "@shared/lib/progress";
import { schedule, type Grade, type ReviewState } from "@shared/lib/srs";
import type { DayAnswers, DayCounts } from "@shared/lib/statsMath";
import { TRIAL_SONGS } from "@shared/lib/billing";
import { getLocales } from "expo-localization";
import { createStore } from "./store";

// The learner's progress and settings on the phone. Same shapes and keys as
// the web app (verso.savedWords, verso.reviews…), so account sync can share
// one format.

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

export type SavedWord = { key: string; word: string; songId: string; line: number; savedAt: number; note?: string };
const isSavedWords = (value: unknown): value is SavedWord[] =>
  Array.isArray(value) && value.every((w) => isObject(w) && typeof w.key === "string" && typeof w.songId === "string" && typeof w.line === "number");
export const savedWordsStore = createStore<SavedWord[]>("verso.savedWords", [], isSavedWords);

export const reviewsStore = createStore<Record<string, ReviewState>>(
  "verso.reviews",
  {},
  (v): v is Record<string, ReviewState> => isObject(v) && Object.values(v).every((s) => isObject(s) && typeof s.due === "number"),
);
export const knownStore = createStore<string[]>("verso.known", [], isStringArray);
export const activityStore = createStore<string[]>("verso.activity", [], isStringArray);
export const trialStore = createStore<string[]>("verso.trial", [], isStringArray);
export const mutedStore = createStore<string[]>("verso.rooms.muted", [], isStringArray);
export const listeningStore = createStore<DayCounts>("verso.listening", {}, (v): v is DayCounts => isObject(v) && Object.values(v).every((n) => typeof n === "number"));
export const reviewLogStore = createStore<DayAnswers>("verso.reviewLog", {}, (v): v is DayAnswers => isObject(v) && Object.values(v).every(Array.isArray));

export type Onboarding = { done: boolean; learn: UiLanguage | null; favorites: string[]; wishes: string[] };
export const onboardingStore = createStore<Onboarding>(
  "verso.onboarding",
  { done: false, learn: null, favorites: [], wishes: [] },
  (v): v is Onboarding => isObject(v) && typeof v.done === "boolean" && isStringArray(v.favorites),
);

export type TranslationMode = "always" | "tap" | "off";
export type TextSize = "s" | "m" | "l" | "xl";
export type Preferences = { lang: UiLanguage; speak: UiLanguage | null; translation: TranslationMode; size: TextSize };

function deviceLanguage(): UiLanguage {
  try {
    return languageFromDevice(getLocales().map((l) => l.languageTag));
  } catch {
    return "en";
  }
}
export const preferencesStore = createStore<Preferences>(
  "verso.mobilePrefs",
  { lang: deviceLanguage(), speak: null, translation: "always", size: "m" },
  (v): v is Preferences => isObject(v) && isUiLanguage(v.lang),
);
export function updatePreferences(patch: Partial<Preferences>) {
  preferencesStore.set({ ...preferencesStore.get(), ...patch });
}

/** Resolves when every store has read the phone's storage (before deciding on onboarding). */
export const storesLoaded = Promise.all(
  [savedWordsStore, reviewsStore, knownStore, activityStore, trialStore, onboardingStore, preferencesStore, listeningStore, reviewLogStore, mutedStore].map((s) => s.loaded),
).then(() => undefined);

export const wordId = (songId: string, key: string) => `${songId}:${key}`;

export function recordActivity() {
  const today = dayKey(new Date());
  const days = activityStore.get();
  if (!days.includes(today)) activityStore.set([...days, today].slice(-400));
}

export function isSaved(words: SavedWord[], songId: string, key: string) {
  return words.some((w) => w.songId === songId && w.key === key);
}

export function saveWord(entry: Omit<SavedWord, "savedAt">) {
  if (isSaved(savedWordsStore.get(), entry.songId, entry.key)) return;
  savedWordsStore.set([{ ...entry, savedAt: Date.now() }, ...savedWordsStore.get()]);
  recordActivity();
}

export function removeWord(songId: string, key: string) {
  savedWordsStore.set(savedWordsStore.get().filter((w) => !(w.songId === songId && w.key === key)));
}

export function toggleSaved(entry: Omit<SavedWord, "savedAt">) {
  if (isSaved(savedWordsStore.get(), entry.songId, entry.key)) removeWord(entry.songId, entry.key);
  else saveWord(entry);
}

export function setNote(songId: string, key: string, note: string) {
  const trimmed = note.trim().slice(0, 500);
  savedWordsStore.set(savedWordsStore.get().map((w) => (w.songId === songId && w.key === key ? { ...w, note: trimmed || undefined } : w)));
}

export function toggleKnown(id: string) {
  const known = knownStore.get();
  knownStore.set(known.includes(id) ? known.filter((k) => k !== id) : [...known, id]);
  recordActivity();
}

export function gradeWord(id: string, grade: Grade) {
  reviewsStore.set({ ...reviewsStore.get(), [id]: schedule(reviewsStore.get()[id], grade, Date.now()) });
  const day = dayKey(new Date());
  const log = reviewLogStore.get();
  const [total, right] = log[day] ?? [0, 0];
  reviewLogStore.set({ ...log, [day]: [total + 1, right + (grade === "again" ? 0 : 1)] });
  recordActivity();
}

export function addListening(seconds: number) {
  const day = dayKey(new Date());
  const log = listeningStore.get();
  listeningStore.set({ ...log, [day]: (log[day] ?? 0) + seconds });
}

/** Starts a free trial song; false once the trial's songs are used up. */
export function startTrialSong(songId: string): boolean {
  const songs = trialStore.get();
  if (songs.includes(songId)) return true;
  if (songs.length >= TRIAL_SONGS) return false;
  trialStore.set([...songs, songId]);
  return true;
}
