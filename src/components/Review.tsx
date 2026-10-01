"use client";

import Link from "next/link";
import { useState } from "react";
import { directionOf, format } from "@/lib/i18n";
import { gradeWord, reviewsStore, savedWordsStore, speak, wordId, type SavedWord } from "@/lib/learnerStores";
import { lookupGloss } from "@/lib/song";
import { isDue, type Grade } from "@/lib/srs";
import { usePreferences } from "./Preferences";
import { useMeaningLang } from "./useMeaningLang";
import { useSongs } from "./useSongs";

/** Flashcards: the saved words that are due, one at a time. */
export function Review() {
  const { t } = usePreferences();
  const words = savedWordsStore.useValue();
  const reviews = reviewsStore.useValue();
  // The queue is fixed when the session starts so graded cards don't reshuffle it.
  const [queue] = useState(() => {
    const now = Date.now();
    return words.filter((w) => isDue(reviews[wordId(w.songId, w.key)], now));
  });
  const [index, setIndex] = useState(0);
  const card = queue[index];

  if (!card) {
    return (
      <section className="pt-4 text-center">
        <h1 className="text-3xl font-bold">{t.practice.review}</h1>
        <p className="mt-10 text-xl">{words.length === 0 ? t.words.empty : queue.length ? t.practice.reviewDone : t.practice.reviewNone}</p>
        <Link href="/practice" className="mt-8 inline-block rounded-xl border border-border px-5 py-3 font-medium">
          {t.nav.practice}
        </Link>
      </section>
    );
  }

  return (
    <section className="pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.practice.review}</h1>
        <span className="text-sm text-muted">{format(t.quiz.progress, { n: index + 1, total: queue.length })}</span>
      </div>
      <Flashcard
        key={`${card.songId}:${card.key}`}
        entry={card}
        onGrade={(grade) => {
          gradeWord(wordId(card.songId, card.key), grade);
          setIndex(index + 1);
        }}
      />
    </section>
  );
}

function Flashcard({ entry, onGrade }: { entry: SavedWord; onGrade: (grade: Grade) => void }) {
  const { t } = usePreferences();
  const song = useSongs().find((s) => s.id === entry.songId);
  const meaningLang = useMeaningLang(song?.language ?? "en");
  const [flipped, setFlipped] = useState(false);
  if (!song) return null;

  const gloss = lookupGloss(song, entry.key);
  const meaning = gloss && meaningLang ? gloss.meanings[meaningLang] : undefined;
  const line = song.lines[entry.line];
  const grades: [Grade, string, string][] = [
    ["again", t.practice.again, "border-red-400"],
    ["hard", t.practice.hard, "border-amber-400"],
    ["good", t.practice.good, "border-green-500"],
    ["easy", t.practice.easy, "border-accent"],
  ];

  return (
    <div className="mt-6 rounded-3xl border border-border bg-surface p-6 text-center">
      <button type="button" onClick={() => speak(entry.word, song.speechLang, 0.8)} className="text-4xl font-bold" dir={directionOf(song.language)}>
        {entry.word} <span className="text-xl">🔊</span>
      </button>
      {line && (
        <p className="mt-3 text-muted" dir={directionOf(song.language)}>
          “{line.text}”
        </p>
      )}

      {flipped ? (
        <>
          <p className="mt-6 text-2xl" dir={meaningLang ? directionOf(meaningLang) : undefined}>
            {meaning ?? gloss?.lemma ?? "—"}
          </p>
          {gloss?.note && <p className="mt-2 text-sm text-muted">{gloss.note}</p>}
          <div className="mt-6 grid grid-cols-4 gap-2">
            {grades.map(([grade, label, border]) => (
              <button
                key={grade}
                type="button"
                onClick={() => onGrade(grade)}
                className={`rounded-xl border-2 ${border} px-2 py-3 text-sm font-semibold`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setFlipped(true)} className="mt-8 w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white">
          {t.practice.show}
        </button>
      )}
    </div>
  );
}
