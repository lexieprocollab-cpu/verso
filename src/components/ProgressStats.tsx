"use client";

import { useState } from "react";
import { LANGUAGE_NAMES, format, type UiLanguage } from "@/lib/i18n";
import { knownWordsStore, reviewsStore, savedWordsStore } from "@/lib/learnerStores";
import { isKnown } from "@/lib/srs";
import { accuracy, dueForecast, lastDays, listeningStore, minutesPerDay, reviewLogStore } from "@/lib/stats";
import { usePremium } from "@/lib/subscription";
import { ColumnChart } from "./ColumnChart";
import { usePreferences } from "./Preferences";
import { useStreak } from "./useProgress";
import { useSongs } from "./useSongs";

/** Advanced stats (step 30): tiles for everyone, charts for subscribers. */
export function ProgressStats() {
  const { t, lang } = usePreferences();
  const [now] = useState(() => new Date());
  const premium = usePremium();
  const streakDays = useStreak();
  const saved = savedWordsStore.useValue();
  const known = knownWordsStore.useValue();
  const reviews = reviewsStore.useValue();
  const listening = listeningStore.useValue();
  const reviewLog = reviewLogStore.useValue();
  const songs = useSongs();

  const month = lastDays(30, now);
  const fortnight = lastDays(14, now);
  const knownCount = new Set([...known, ...Object.keys(reviews).filter((id) => isKnown(reviews[id]))]).size;
  const minutes30 = minutesPerDay(listening, month).reduce((a, b) => a + b, 0);
  const correct = accuracy(reviewLog, month);

  const dayName = (day: string, style: "short" | "long") => {
    const [y, m, d] = day.split("-").map(Number);
    return new Intl.DateTimeFormat(lang, style === "short" ? { weekday: "narrow" } : { weekday: "long", day: "numeric", month: "short" }).format(new Date(y, m - 1, d));
  };
  const upcoming = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));

  const languageOf = new Map(songs.map((song) => [song.id, song.language]));
  const byLanguage = new Map<UiLanguage, number>();
  for (const word of saved) {
    const language = languageOf.get(word.songId);
    if (language) byLanguage.set(language, (byLanguage.get(language) ?? 0) + 1);
  }
  const languages = [...byLanguage.entries()].sort((a, b) => b[1] - a[1]);
  const most = Math.max(1, ...languages.map(([, n]) => n));

  const tiles = [
    { label: t.stats.streak, value: `${streakDays}` },
    { label: t.stats.saved, value: `${saved.length}` },
    { label: t.stats.known, value: `${knownCount}` },
    { label: t.stats.minutes, value: `${minutes30}` },
    { label: t.stats.accuracy, value: correct === null ? t.stats.none : `${correct}%` },
  ];

  return (
    <section className="space-y-5 pt-4">
      <h1 className="text-3xl font-bold">{t.stats.title}</h1>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{tile.label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>

      {!premium ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface p-5 text-center text-muted">🔒 {t.stats.premium}</p>
      ) : (
        <>
          <ColumnChart
            title={t.stats.listening}
            values={minutesPerDay(listening, fortnight)}
            labels={fortnight.map((day) => dayName(day, "short"))}
            fullLabels={fortnight.map((day, i) => (i === fortnight.length - 1 ? t.stats.today : dayName(day, "long")))}
            format={(n) => format(t.stats.min, { n })}
            tableLabel={t.stats.table}
            columnLabel={t.stats.day}
          />
          <ColumnChart
            title={t.stats.due}
            values={dueForecast(reviews, now)}
            labels={upcoming.map((date) => new Intl.DateTimeFormat(lang, { weekday: "narrow" }).format(date))}
            fullLabels={upcoming.map((date, i) => (i === 0 ? t.stats.today : new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "short" }).format(date)))}
            format={(n) => format(t.stats.words, { n })}
            tableLabel={t.stats.table}
            columnLabel={t.stats.day}
          />
          {languages.length > 0 && (
            <figure className="rounded-2xl border border-border bg-surface p-4">
              <figcaption className="mb-3 font-semibold">{t.stats.byLanguage}</figcaption>
              <ul className="space-y-2">
                {languages.map(([language, count]) => (
                  <li key={language} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm">
                    <span className="truncate">{LANGUAGE_NAMES[language]}</span>
                    <span className="h-3 rounded-e-[4px]" style={{ width: `${(count / most) * 100}%`, background: "var(--chart)" }} />
                    <span className="tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </figure>
          )}
        </>
      )}
    </section>
  );
}
