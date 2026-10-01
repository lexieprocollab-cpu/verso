"use client";

import Link from "next/link";
import { useState } from "react";
import { LANGUAGE_NAMES, UI_LANGUAGES, directionOf, format, type UiLanguage } from "@/lib/i18n";
import {
  knownWordsStore,
  matchesSearch,
  removeWord,
  reviewsStore,
  savedWordsStore,
  setWordNote,
  speak,
  wordId,
  wordStatus,
  type SavedWord,
  type WordStatus,
} from "@/lib/learnerStores";
import { lookupGloss, type Song } from "@/lib/song";
import { usePreferences } from "./Preferences";
import { useMeaningLang } from "./useMeaningLang";
import { useSongs } from "./useSongs";

const STATUS_STYLE: Record<WordStatus, string> = {
  new: "border-border text-muted",
  learning: "border-amber-400 text-amber-700 dark:text-amber-300",
  known: "border-green-500 text-green-700 dark:text-green-400",
};

export function MyWords() {
  const { t } = usePreferences();
  const words = savedWordsStore.useValue();
  const known = knownWordsStore.useValue();
  const reviews = reviewsStore.useValue();
  const songs = useSongs();
  const [songFilter, setSongFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState<UiLanguage | "all">("all");
  const [statusFilter, setStatusFilter] = useState<WordStatus | "all">("all");
  const [query, setQuery] = useState("");

  const rows = words.flatMap((entry) => {
    const song = songs.find((s) => s.id === entry.songId);
    if (!song) return [];
    const status = wordStatus(wordId(song.id, entry.key), known, reviews);
    const meanings = Object.values(lookupGloss(song, entry.key)?.meanings ?? {});
    const visible =
      (songFilter === "all" || song.id === songFilter) &&
      (languageFilter === "all" || song.language === languageFilter) &&
      (statusFilter === "all" || status === statusFilter) &&
      matchesSearch(query, entry.word, entry.note, ...meanings);
    return visible ? [{ entry, song, status }] : [];
  });

  const songsWithWords = songs.filter((s) => words.some((w) => w.songId === s.id));
  const languages = UI_LANGUAGES.filter((code) => songsWithWords.some((s) => s.language === code));
  const statuses: [WordStatus | "all", string][] = [
    ["all", t.mywords.all],
    ["new", t.mywords.statusNew],
    ["learning", t.mywords.statusLearning],
    ["known", t.mywords.statusKnown],
  ];

  return (
    <section className="pt-4">
      <h1 className="text-3xl font-bold">{t.nav.words}</h1>
      {words.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted">{t.words.empty}</p>
      ) : (
        <>
          <p className="mt-1 text-muted">{format(t.words.count, { n: words.length })}</p>

          <div className="mt-4 grid gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.mywords.search}
              aria-label={t.mywords.search}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5"
            />
            <div className="flex flex-wrap gap-2 text-sm">
              <select
                value={songFilter}
                onChange={(e) => setSongFilter(e.target.value)}
                aria-label={t.mywords.allSongs}
                className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3 py-1.5"
              >
                <option value="all">{t.mywords.allSongs}</option>
                {songsWithWords.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              {languages.length > 1 && (
                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value as UiLanguage | "all")}
                  aria-label={t.mywords.allLanguages}
                  className="rounded-full border border-border bg-surface px-3 py-1.5"
                >
                  <option value="all">{t.mywords.allLanguages}</option>
                  {languages.map((code) => (
                    <option key={code} value={code}>
                      {LANGUAGE_NAMES[code]}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-sm" role="radiogroup" aria-label="Status">
              {statuses.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-full border px-3 py-1.5 font-medium ${
                    statusFilter === value ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="mt-6 text-center text-muted">{t.mywords.noMatch}</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {rows.map(({ entry, song, status }) => (
                <WordRow key={`${entry.songId}:${entry.key}`} entry={entry} song={song} status={status} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function WordRow({ entry, song, status }: { entry: SavedWord; song: Song; status: WordStatus }) {
  const { t } = usePreferences();
  const meaningLang = useMeaningLang(song.language);
  const gloss = lookupGloss(song, entry.key);
  const meaning = gloss && meaningLang ? gloss.meanings[meaningLang] : undefined;
  const line = song.lines[entry.line];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.note ?? "");
  const statusLabel = { new: t.mywords.statusNew, learning: t.mywords.statusLearning, known: t.mywords.statusKnown }[status];

  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => speak(entry.word, song.speechLang, 0.8)}
              className="text-2xl font-bold"
              dir={directionOf(song.language)}
            >
              {entry.word} <span className="text-base">🔊</span>
            </button>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{statusLabel}</span>
            {entry.key.includes(" ") && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{t.mywords.phrase}</span>
            )}
          </div>
          {meaning && (
            <p className="mt-0.5 text-lg" dir={meaningLang ? directionOf(meaningLang) : undefined}>
              {meaning}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => removeWord(entry.songId, entry.key)}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted"
        >
          {t.words.remove}
        </button>
      </div>

      {line && (
        <p className="mt-2 text-sm text-muted" dir={directionOf(song.language)}>
          “{line.text}” — {song.title}
        </p>
      )}

      {editing ? (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            rows={2}
            autoFocus
            aria-label={t.mywords.note}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          />
          <div className="mt-1 flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => {
                setWordNote(entry.songId, entry.key, draft);
                setEditing(false);
              }}
              className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-white"
            >
              {t.mywords.saveNote}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-border px-3 py-1.5">
              {t.phrase.cancel}
            </button>
          </div>
        </div>
      ) : entry.note ? (
        <button
          type="button"
          onClick={() => {
            setDraft(entry.note ?? "");
            setEditing(true);
          }}
          className="mt-3 block w-full rounded-lg bg-amber-300/25 px-3 py-2 text-start text-sm"
        >
          📝 {entry.note}
        </button>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href={`/player?song=${song.id}&line=${entry.line}`} className="text-accent">
          ▶ {t.words.replay}
        </Link>
        {!editing && !entry.note && (
          <button type="button" onClick={() => setEditing(true)} className="text-muted">
            📝 {t.mywords.addNote}
          </button>
        )}
      </div>
    </li>
  );
}
