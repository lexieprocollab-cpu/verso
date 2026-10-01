"use client";

import { useState } from "react";
import { directionOf } from "@/lib/i18n";
import { recordActivity, savedWordsStore, speak } from "@/lib/learnerStores";
import { AiNotice } from "./AiNotice";
import { usePreferences } from "./Preferences";
import { useAi } from "./useAi";
import { useMeaningLang } from "./useMeaningLang";
import { useSong, useSongs } from "./useSongs";

/** Build a sentence from saved words; AI checks it or writes one to translate. */
export function SentenceBuilder() {
  const { t } = usePreferences();
  const allSaved = savedWordsStore.useValue();
  const songs = useSongs();
  // Practice the language of the most recently saved word (the demo song's language if none yet).
  const song = useSong(allSaved[0]?.songId) ?? songs[songs.length - 1];
  const meaningLang = useMeaningLang(song.language) ?? "en";
  const sameLanguage = new Set(songs.filter((s) => s.language === song.language).map((s) => s.id));
  const saved = allSaved.filter((w) => sameLanguage.has(w.songId));
  const bank = [...new Set(saved.map((w) => w.word.toLowerCase()))];
  const [sentence, setSentence] = useState("");
  const [showTranslation, setShowTranslation] = useState(false);
  const check = useAi("check");
  const make = useAi("sentence");
  const learnDir = directionOf(song.language);
  const meaningDir = directionOf(meaningLang);

  function addWord(word: string) {
    setSentence((current) => (current.trim() ? `${current.trim()} ${word}` : word));
    check.reset();
  }

  return (
    <section className="pt-4">
      <h1 className="text-3xl font-bold">{t.sentence.title}</h1>
      <p className="mt-1 text-muted">{t.sentence.hint}</p>

      {bank.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-muted">{t.words.empty}</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2" dir={learnDir}>
          {bank.map((word) => (
            <button
              key={word}
              type="button"
              onClick={() => addWord(word)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-lg font-medium hover:border-accent"
            >
              {word}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={sentence}
        onChange={(e) => {
          setSentence(e.target.value);
          check.reset();
        }}
        placeholder={t.sentence.placeholder}
        dir={learnDir}
        rows={3}
        className="mt-4 w-full rounded-2xl border border-border bg-surface p-4 text-xl"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!sentence.trim() || check.state.status === "loading"}
          onClick={() => {
            recordActivity();
            void check.run({ sentence: sentence.trim(), words: bank, learn: song.language, meaning: meaningLang });
          }}
          className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-40"
        >
          ✨ {t.sentence.check}
        </button>
        <button
          type="button"
          onClick={() => setSentence("")}
          className="rounded-xl border border-border px-4 py-3 font-medium"
        >
          {t.quiz.clear}
        </button>
      </div>

      <div className="mt-3">
        <AiNotice state={check.state} />
        {check.state.status === "done" && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className={`font-semibold ${check.state.data.is_correct ? "text-green-600 dark:text-green-400" : "text-amber-600"}`}>
              {check.state.data.is_correct ? t.sentence.correct : t.sentence.fixed}
            </p>
            {!check.state.data.is_correct && (
              <p className="mt-1 text-xl font-medium" dir={learnDir}>
                {check.state.data.corrected}
              </p>
            )}
            <p className="mt-2 text-muted" dir={meaningDir}>
              {check.state.data.translation}
            </p>
            <p className="mt-2 text-sm" dir={meaningDir}>
              {check.state.data.explanation}
            </p>
          </div>
        )}
      </div>

      <hr className="my-6 border-border" />

      <button
        type="button"
        disabled={bank.length === 0 || make.state.status === "loading"}
        onClick={() => {
          setShowTranslation(false);
          void make.run({ words: bank, learn: song.language, meaning: meaningLang });
        }}
        className="w-full rounded-xl border border-accent px-4 py-3 font-semibold text-accent disabled:opacity-40"
      >
        ✨ {t.sentence.makeOne}
      </button>
      <div className="mt-3">
        <AiNotice state={make.state} />
        {make.state.status === "done" && (
          <div className="rounded-2xl border border-border bg-surface p-4 text-center">
            <button type="button" onClick={() => speak(make.state.status === "done" ? make.state.data.sentence : "", song.speechLang)} className="text-2xl font-semibold" dir={learnDir}>
              {make.state.data.sentence} <span className="text-base">🔊</span>
            </button>
            {showTranslation ? (
              <p className="mt-2 text-lg text-muted" dir={meaningDir}>
                {make.state.data.translation}
              </p>
            ) : (
              <button type="button" onClick={() => setShowTranslation(true)} className="mt-2 block w-full text-sm font-medium text-accent">
                {t.sentence.reveal}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
