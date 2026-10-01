"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { directionOf, format, type UiLanguage } from "@/lib/i18n";
import { quizFromAi } from "@/lib/ai/quizFromAi";
import { recordActivity, saveWord, speak } from "@/lib/learnerStores";
import { track } from "@/lib/track";
import { AiNotice } from "./AiNotice";
import { useAi } from "./useAi";
import { lineOfWord, lineWords, scramble, tokenize, wordKey, type QuizItem, type Song } from "@/lib/song";
import { usePreferences } from "./Preferences";
import { TappableText } from "./TappableText";
import { useMeaningLang } from "./useMeaningLang";
import { WordCard, type WordSelection } from "./WordCard";

type Result = { correct: boolean; picked: number | string };

export function Quiz({ song }: { song: Song }) {
  const { t } = usePreferences();
  const meaningLang = useMeaningLang(song.language);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [savedForReview, setSavedForReview] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [selection, setSelection] = useState<WordSelection | null>(null);
  const [items, setItems] = useState<QuizItem[]>(song.quiz);
  const [level, setLevel] = useState<"easy" | "medium" | "hard">("easy");
  const generator = useAi("quiz");
  const reported = useRef(false);

  async function newAiQuiz() {
    const lines = song.lines.map((line) => line.text);
    const outcome = await generator.run({
      title: song.title,
      lines,
      learn: song.language,
      meaning: meaningLang ?? "en",
      level,
    });
    if (outcome.status !== "done") return;
    const generated = quizFromAi(outcome.data, lines, meaningLang ?? "en");
    if (generated.length < 3) return;
    setItems(generated);
    restart();
  }

  const item = items[index];
  const openWord = (key: string, word: string) => setSelection({ key, word, line: lineOfWord(song, key) });
  const isKnown = (key: string) => key in song.glossary;

  function answer(correct: boolean, picked: number | string, reviewWord?: string) {
    setResult({ correct, picked });
    recordActivity();
    if (correct) setScore(score + 1);
    else if (reviewWord) {
      const key = wordKey(reviewWord);
      saveWord({ key, word: reviewWord, songId: song.id, line: lineOfWord(song, key) ?? 0 });
      setSavedForReview(true);
    }
  }

  function next() {
    setIndex(index + 1);
    setResult(null);
    setSavedForReview(false);
    setShowTranslation(false);
  }

  function restart() {
    reported.current = false;
    setIndex(0);
    setScore(0);
    setResult(null);
    setSavedForReview(false);
    setShowTranslation(false);
  }

  const finished = !item;
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;
    track("quiz_completed", { song: song.id, score, total: items.length });
  }, [finished, song.id, score, items.length]);

  if (!item) {
    return (
      <section className="pt-4 text-center">
        <h1 className="text-3xl font-bold">{t.quiz.title}</h1>
        <p className="mt-8 text-6xl">{score === items.length ? "🏆" : "🎵"}</p>
        <p className="mt-4 text-2xl font-semibold">{format(t.quiz.done, { score, total: items.length })}</p>
        <div className="mt-8 flex justify-center gap-2">
          <button type="button" onClick={restart} className="rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            {t.quiz.again}
          </button>
          <Link href="/player" className="rounded-xl border border-border px-5 py-3 font-medium">
            {t.quiz.backToSong}
          </Link>
        </div>
      </section>
    );
  }

  const translation = meaningLang ? translationOf(song, item, meaningLang) : undefined;
  const levels: ["easy" | "medium" | "hard", string][] = [
    ["easy", t.ai.easy],
    ["medium", t.ai.medium],
    ["hard", t.ai.hard],
  ];

  return (
    <section className="pt-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.quiz.title}</h1>
        <span className="text-sm text-muted">{format(t.quiz.progress, { n: index + 1, total: items.length })}</span>
      </div>
      <p className="text-sm text-muted" dir="ltr">
        {song.title}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as typeof level)}
          aria-label="Level"
          className="rounded-full border border-border bg-surface px-3 py-1.5"
        >
          {levels.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={newAiQuiz}
          disabled={generator.state.status === "loading"}
          className="rounded-full border border-accent px-3 py-1.5 font-medium text-accent disabled:opacity-50"
        >
          ✨ {generator.state.status === "loading" ? t.ai.generating : t.ai.newQuiz}
        </button>
        {generator.state.status === "error" && <AiNotice state={generator.state} />}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(index / items.length) * 100}%` }} />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xl font-semibold">
            {item.kind === "fill" ? (
              t.quiz.chooseWord
            ) : item.kind === "order" ? (
              t.quiz.orderWords
            ) : (
              <span dir="ltr">
                <TappableText text={item.question} onWord={openWord} isKnown={isKnown} />
              </span>
            )}
          </p>
          {item.kind !== "fill" && item.kind !== "order" && (
            <button
              type="button"
              onClick={() => speak(item.question, song.speechLang)}
              aria-label={t.player.listen}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              🔊
            </button>
          )}
        </div>

        {translation && (
          <div className="mt-2">
            {showTranslation ? (
              <p className="text-muted" dir={meaningLang ? directionOf(meaningLang) : undefined}>
                {translation}
              </p>
            ) : (
              <button type="button" onClick={() => setShowTranslation(true)} className="text-sm font-medium text-accent">
                🌐 {t.quiz.translator}
              </button>
            )}
          </div>
        )}

        <div className="mt-5">
          {item.kind === "picture" && (
            <div className="grid grid-cols-3 gap-3">
              {item.choices.map((choice, i) => (
                <div key={i} className="text-center">
                  <button
                    type="button"
                    disabled={result !== null}
                    onClick={() => answer(Boolean(choice.correct), i, item.choices.find((c) => c.correct)?.word)}
                    aria-label={result ? choice.word : `${i + 1}`}
                    className={`grid aspect-square w-full place-items-center rounded-2xl border-2 text-5xl sm:text-6xl ${choiceStyle(
                      result,
                      i,
                      Boolean(choice.correct),
                    )}`}
                  >
                    {choice.emoji}
                  </button>
                  {result && (
                    <span dir="ltr" className="mt-1 block text-lg font-medium">
                      <TappableText text={choice.word} onWord={openWord} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {item.kind === "choice" && (
            <div className="grid gap-2" dir="ltr">
              {item.choices.map((choice, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={result !== null}
                  onClick={() => answer(Boolean(choice.correct), i)}
                  className={`rounded-xl border-2 px-4 py-3 text-start text-lg font-medium ${choiceStyle(
                    result,
                    i,
                    Boolean(choice.correct),
                  )}`}
                >
                  {choice.text}
                </button>
              ))}
            </div>
          )}

          {item.kind === "fill" && <FillQuestion song={song} item={item} result={result} onAnswer={answer} onWord={openWord} />}

          {item.kind === "order" && (
            <OrderQuestion key={index} song={song} line={item.line} result={result} onAnswer={answer} />
          )}
        </div>

        {result && (
          <div className="mt-5">
            <p className={`font-semibold ${result.correct ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {result.correct ? t.quiz.correct : t.quiz.wrong}
            </p>
            {savedForReview && <p className="mt-1 text-sm text-muted">{t.quiz.addedForReview}</p>}
            <button type="button" onClick={next} className="mt-4 w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white">
              {t.quiz.next}
            </button>
          </div>
        )}
      </div>

      {selection && (
        <WordCard song={song} selection={selection} meaningLang={meaningLang} onClose={() => setSelection(null)} />
      )}
    </section>
  );
}

function translationOf(song: Song, item: QuizItem, lang: UiLanguage) {
  if (item.kind === "picture" || item.kind === "choice") return item.translations[lang];
  return song.lines[item.line].translations[lang];
}

function choiceStyle(result: Result | null, index: number, correct: boolean) {
  if (!result) return "border-border bg-bg hover:border-accent";
  if (correct) return "border-green-500 bg-green-500/10";
  if (result.picked === index) return "border-red-500 bg-red-500/10";
  return "border-border bg-bg opacity-60";
}

function FillQuestion({
  song,
  item,
  result,
  onAnswer,
  onWord,
}: {
  song: Song;
  item: Extract<QuizItem, { kind: "fill" }>;
  result: Result | null;
  onAnswer: (correct: boolean, picked: number, reviewWord?: string) => void;
  onWord: (key: string, word: string) => void;
}) {
  const answerKey = wordKey(item.answer);
  const tokens = tokenize(song.lines[item.line].text);
  const blankIndex = tokens.findIndex((token) => token.isWord && token.key === answerKey);
  return (
    <div dir="ltr">
      <p className="text-2xl leading-relaxed">
        {tokens.map((token, i) => {
          if (i === blankIndex) {
            return (
              <span
                key={i}
                className={`mx-1 inline-block min-w-16 border-b-2 text-center font-semibold ${
                  result ? "border-green-500 text-green-600 dark:text-green-400" : "border-accent"
                }`}
              >
                {result ? token.text : " "}
              </span>
            );
          }
          return token.isWord ? (
            <TappableText key={i} text={token.text} onWord={onWord} />
          ) : (
            <span key={i}>{token.text}</span>
          );
        })}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {item.options.map((option, i) => (
          <button
            key={option}
            type="button"
            disabled={result !== null}
            onClick={() => onAnswer(option === item.answer, i, item.answer)}
            className={`rounded-xl border-2 px-3 py-3 text-lg font-medium ${choiceStyle(result, i, option === item.answer)}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function OrderQuestion({
  song,
  line,
  result,
  onAnswer,
}: {
  song: Song;
  line: number;
  result: Result | null;
  onAnswer: (correct: boolean, picked: string) => void;
}) {
  const { t } = usePreferences();
  const words = lineWords(song.lines[line].text);
  const [pool] = useState(() => scramble(words.map((word, i) => ({ word, id: i }))));
  const [picked, setPicked] = useState<number[]>([]);
  const byId = (id: number) => pool.find((p) => p.id === id)!.word;
  const sentence = picked.map(byId);

  return (
    <div dir="ltr">
      <div className="flex min-h-14 flex-wrap gap-2 rounded-xl border-2 border-dashed border-border p-2">
        {picked.map((id) => (
          <button
            key={id}
            type="button"
            disabled={result !== null}
            onClick={() => setPicked(picked.filter((p) => p !== id))}
            className="rounded-lg bg-accent-soft px-3 py-1.5 text-lg font-medium text-accent"
          >
            {byId(id)}
          </button>
        ))}
      </div>
      {result && !result.correct && <p className="mt-2 text-lg font-medium text-green-600 dark:text-green-400">{words.join(" ")}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {pool
          .filter((p) => !picked.includes(p.id))
          .map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={result !== null}
              onClick={() => setPicked([...picked, p.id])}
              className="rounded-lg border border-border bg-bg px-3 py-1.5 text-lg font-medium"
            >
              {p.word}
            </button>
          ))}
      </div>
      {!result && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={picked.length !== words.length}
            onClick={() =>
              onAnswer(
                sentence.every((word, i) => word.toLowerCase() === words[i].toLowerCase()),
                sentence.join(" "),
              )
            }
            className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-40"
          >
            {t.quiz.check}
          </button>
          <button type="button" onClick={() => setPicked([])} className="rounded-xl border border-border px-4 py-3 font-medium">
            {t.quiz.clear}
          </button>
        </div>
      )}
    </div>
  );
}
