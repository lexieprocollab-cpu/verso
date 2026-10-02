"use client";

import { useEffect, useRef } from "react";
import { directionOf, type UiLanguage } from "@/lib/i18n";
import { isSaved, knownWordsStore, savedWordsStore, speak, toggleKnown, toggleWord, wordId } from "@/lib/learnerStores";
import { findPhrases, lookupGloss, wordsBetween, type Song } from "@/lib/song";
import { AiNotice } from "./AiNotice";
import { usePreferences } from "./Preferences";
import { useAi } from "./useAi";

/** A tapped word or selected phrase. `key` has spaces for phrases; `index` is the word's position in the line. */
export type WordSelection = { key: string; word: string; line: number | null; index?: number };

/** Bottom sheet for a word or phrase: meaning, grammar, pronunciation, Save and "I know it". */
export function WordCard({
  song,
  selection,
  meaningLang,
  onClose,
  onSelect,
  overVideo = false,
}: {
  song: Song;
  selection: WordSelection;
  meaningLang: UiLanguage | null;
  onClose: () => void;
  /** Opens another word or phrase in the same card (e.g. "Part of the phrase"). */
  onSelect?: (next: WordSelection) => void;
  /**
   * The song plays in an embedded YouTube player, which nothing may cover or
   * dim (YouTube API policy): the card docks at the bottom without a backdrop.
   */
  overVideo?: boolean;
}) {
  const { t } = usePreferences();
  const isPhrase = selection.key.includes(" ");
  const saved = isSaved(savedWordsStore.useValue(), song.id, selection.key);
  const id = wordId(song.id, selection.key);
  const known = knownWordsStore.useValue().includes(id);
  const gloss = lookupGloss(song, selection.key);
  const meaning = gloss && meaningLang ? gloss.meanings[meaningLang] : undefined;
  const line = selection.line === null ? null : song.lines[selection.line];
  const wordAi = useAi("word");
  const phraseAi = useAi("phrase");
  const ai = isPhrase ? phraseAi.state : wordAi.state;
  const runWord = wordAi.run;
  const runPhrase = phraseAi.run;

  // The known phrase this word belongs to, if any.
  const parentPhrase =
    !isPhrase && line && selection.index !== undefined
      ? findPhrases(line.text, song.phrases).find((p) => selection.index! >= p.from && selection.index! <= p.to)
      : undefined;

  const askAi = () => {
    if (!meaningLang) return;
    const input = { line: line?.text ?? selection.word, learn: song.language, meaning: meaningLang };
    if (isPhrase) void runPhrase({ ...input, phrase: selection.word });
    else void runWord({ ...input, word: selection.word });
  };

  // No bundled dictionary entry: ask the AI straight away.
  useEffect(() => {
    if (meaning || !meaningLang) return;
    const input = { line: line?.text ?? selection.word, learn: song.language, meaning: meaningLang };
    if (isPhrase) void runPhrase({ ...input, phrase: selection.word });
    else void runWord({ ...input, word: selection.word });
  }, [meaning, meaningLang, isPhrase, runPhrase, runWord, selection.word, line?.text, song.language]);

  // Without a backdrop to tap, a tap anywhere outside the card closes it.
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!overVideo) return;
    const onDown = (e: PointerEvent) => {
      if (!sheetRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [overVideo, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const wordData = !isPhrase && wordAi.state.status === "done" ? wordAi.state.data : null;
  const phraseData = isPhrase && phraseAi.state.status === "done" ? phraseAi.state.data : null;
  const meaningDir = meaningLang ? directionOf(meaningLang) : undefined;
  const learnDir = directionOf(song.language);

  return (
    <div
      className={
        overVideo
          ? "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
          : "fixed inset-0 z-40 flex items-end justify-center bg-black/30"
      }
      onClick={overVideo ? undefined : onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={!overVideo}
        aria-label={selection.word}
        onClick={(e) => e.stopPropagation()}
        className={`${overVideo ? "pointer-events-auto max-h-[50dvh]" : "max-h-[85dvh]"} w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl`}
      >
        <div className="flex items-start justify-between gap-4">
          <div dir={learnDir} className="min-w-0">
            {isPhrase && <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t.mywords.phrase}</p>}
            <p className={`${isPhrase ? "text-2xl" : "text-3xl"} font-bold`}>{selection.word}</p>
            {(gloss?.lemma || wordData?.lemma) && (
              <p className="mt-1 text-sm text-muted">
                {t.word.baseForm}: <span className="font-medium text-text">{gloss?.lemma || wordData?.lemma}</span>
              </p>
            )}
            {wordData?.hebrew_root && (
              <p className="mt-1 text-sm text-muted">
                {t.ai.root}: <span className="font-medium text-text">{wordData.hebrew_root}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => speak(selection.word, song.speechLang, 0.8)}
            className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-medium"
          >
            🔊 {t.player.listen}
          </button>
        </div>

        {meaning && (
          <p className="mt-4 text-xl" dir={meaningDir}>
            {meaning}
          </p>
        )}
        {gloss?.note && (
          <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm" dir={learnDir}>
            <span className="font-semibold">{t.word.grammar}:</span> {gloss.note}
          </p>
        )}

        {parentPhrase && line && selection.line !== null && (
          <button
            type="button"
            onClick={() =>
              onSelect?.({
                key: parentPhrase.key,
                word: wordsBetween(line.text, parentPhrase.from, parentPhrase.to),
                line: selection.line,
              })
            }
            className="mt-3 block w-full rounded-xl border border-dashed border-accent px-3 py-2 text-start text-sm"
          >
            {t.phrase.partOf}:{" "}
            <span className="font-semibold" dir={learnDir}>
              “{wordsBetween(line.text, parentPhrase.from, parentPhrase.to)}”
            </span>
            {meaningLang && song.phrases?.[parentPhrase.key]?.meanings[meaningLang] && (
              <span className="text-muted" dir={meaningDir}>
                {" "}
                — {song.phrases[parentPhrase.key].meanings[meaningLang]}
              </span>
            )}{" "}
            →
          </button>
        )}

        {(wordData || phraseData) && (
          <div className="mt-4 rounded-xl border border-accent/40 p-3" dir={meaningDir}>
            <p className="text-xs font-semibold text-accent">
              ✨ AI{phraseData?.is_idiom ? ` · ${t.phrase.idiom}` : ""}
            </p>
            <p className="mt-1 text-lg">{wordData?.meaning ?? phraseData?.meaning}</p>
            {phraseData?.literal && (
              <p className="mt-1 text-sm text-muted">
                {t.phrase.literal}: {phraseData.literal}
              </p>
            )}
            {(wordData?.note || phraseData?.note) && <p className="mt-1 text-sm text-muted">{wordData?.note || phraseData?.note}</p>}
          </div>
        )}
        <div className="mt-3">
          <AiNotice state={ai} />
          {meaning && ai.status === "idle" && meaningLang && (
            <button type="button" onClick={askAi} className="text-sm font-medium text-accent">
              ✨ {t.ai.ask}
            </button>
          )}
        </div>

        {line && (
          <div className="mt-4 text-sm">
            <p className="text-muted">{t.word.fromLine}</p>
            <p dir={learnDir} className="mt-1 font-medium">
              {line.text}
            </p>
            {meaningLang && line.translations[meaningLang] && (
              <p className="mt-0.5 text-muted" dir={meaningDir}>
                {line.translations[meaningLang]}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              toggleWord({ key: selection.key, word: selection.word, songId: song.id, line: selection.line ?? 0 })
            }
            aria-pressed={saved}
            className={`flex-1 rounded-xl px-4 py-3 font-semibold ${
              saved ? "border border-accent bg-accent-soft text-accent" : "bg-accent text-white"
            }`}
          >
            {saved ? `♥ ${t.word.saved}` : `♡ ${t.word.save}`}
          </button>
          <button
            type="button"
            onClick={() => toggleKnown(id)}
            aria-pressed={known}
            className={`rounded-xl border px-4 py-3 font-medium ${known ? "border-green-500 text-green-600 dark:text-green-400" : "border-border"}`}
          >
            {known ? t.more.known : t.more.knowIt}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-3 font-medium">
            {t.word.close}
          </button>
        </div>
      </div>
    </div>
  );
}
