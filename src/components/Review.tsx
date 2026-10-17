"use client";

import Link from "next/link";
import { useState } from "react";
import { directionOf, format } from "@/lib/i18n";
import { gradeWord, photoWordsStore, reviewsStore, savedWordsStore, speak, wordId, type SavedWord } from "@/lib/learnerStores";
import type { PhotoWord } from "@/lib/photoWords";
import { SPEECH_LANG } from "@/lib/song";
import { lookupGloss } from "@/lib/song";
import { isDue, type Grade } from "@/lib/srs";
import { usePreferences } from "./Preferences";
import { useMeaningLang } from "./useMeaningLang";
import { useSongs } from "./useSongs";

type Card = { kind: "song"; id: string; entry: SavedWord } | { kind: "photo"; id: string; word: PhotoWord };

/** Flashcards: the saved words (from songs and photos) that are due, one at a time. */
export function Review() {
  const { t } = usePreferences();
  const words = savedWordsStore.useValue();
  const photoWords = photoWordsStore.useValue();
  const reviews = reviewsStore.useValue();
  // The queue is fixed when the session starts so graded cards don't reshuffle it. Saved words load
  // from the device after the first render, so it is fixed the first time due cards appear.
  const [now] = useState(() => Date.now());
  const due = [
    ...words.map((entry): Card => ({ kind: "song", id: wordId(entry.songId, entry.key), entry })),
    ...photoWords.map((word): Card => ({ kind: "photo", id: word.id, word })),
  ].filter((card) => isDue(reviews[card.id], now));
  const [fixed, setFixed] = useState<Card[] | null>(null);
  if (fixed === null && due.length > 0) setFixed(due);
  const queue = fixed ?? due;
  const [index, setIndex] = useState(0);
  const card = queue[index];

  if (!card) {
    return (
      <section className="pt-4 text-center">
        <h1 className="text-3xl font-bold">{t.practice.review}</h1>
        <p className="mt-10 text-xl">{words.length + photoWords.length === 0 ? t.words.empty : queue.length ? t.practice.reviewDone : t.practice.reviewNone}</p>
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
      {card.kind === "song" ? (
        <Flashcard
          key={card.id}
          entry={card.entry}
          onGrade={(grade) => {
            gradeWord(card.id, grade);
            setIndex(index + 1);
          }}
        />
      ) : (
        <PhotoFlashcard
          key={card.id}
          word={card.word}
          onGrade={(grade) => {
            gradeWord(card.id, grade);
            setIndex(index + 1);
          }}
        />
      )}
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
          <GradeButtons onGrade={onGrade} />
        </>
      ) : (
        <button type="button" onClick={() => setFlipped(true)} className="mt-8 w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white">
          {t.practice.show}
        </button>
      )}
    </div>
  );
}

/** A word learned from a photo: the word and its example on the front, meaning and definition on the back. */
function PhotoFlashcard({ word, onGrade }: { word: PhotoWord; onGrade: (grade: Grade) => void }) {
  const { t } = usePreferences();
  const [flipped, setFlipped] = useState(false);
  const learnDir = directionOf(word.learn);
  const meaningDir = directionOf(word.meaningLang);

  return (
    <div className="mt-6 rounded-3xl border border-border bg-surface p-6 text-center">
      <button type="button" onClick={() => speak(word.word, SPEECH_LANG[word.learn], 0.8)} className="text-4xl font-bold" dir={learnDir}>
        📷 {word.word} <span className="text-xl">🔊</span>
      </button>
      {word.example && (
        <p className="mt-3 text-muted" dir={learnDir}>
          “{word.example}”
        </p>
      )}

      {flipped ? (
        <>
          <p className="mt-6 text-2xl" dir={meaningDir}>
            {word.meaning}
          </p>
          <p className="mt-2 text-sm text-muted" dir={meaningDir}>
            {word.definition}
          </p>
          <GradeButtons onGrade={onGrade} />
        </>
      ) : (
        <button type="button" onClick={() => setFlipped(true)} className="mt-8 w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white">
          {t.practice.show}
        </button>
      )}
    </div>
  );
}

function GradeButtons({ onGrade }: { onGrade: (grade: Grade) => void }) {
  const { t } = usePreferences();
  const grades: [Grade, string, string][] = [
    ["again", t.practice.again, "border-red-400"],
    ["hard", t.practice.hard, "border-amber-400"],
    ["good", t.practice.good, "border-green-500"],
    ["easy", t.practice.easy, "border-accent"],
  ];
  return (
    <div className="mt-6 grid grid-cols-4 gap-2">
      {grades.map(([grade, label, border]) => (
        <button key={grade} type="button" onClick={() => onGrade(grade)} className={`rounded-xl border-2 ${border} px-2 py-3 text-sm font-semibold`}>
          {label}
        </button>
      ))}
    </div>
  );
}
