"use client";

import { useMemo, useState } from "react";
import { callAi, type AiFailure } from "@/lib/ai/client";
import type { TutorResult } from "@/lib/ai/schemas";
import { directionOf } from "@/lib/i18n";
import { recordActivity, savedWordsStore, speak } from "@/lib/learnerStores";
import { songVocabulary } from "@/lib/rooms/rules";
import { AiNotice } from "./AiNotice";
import { usePreferences } from "./Preferences";
import { useMeaningLang } from "./useMeaningLang";
import { useSongs } from "./useSongs";

type Level = "easy" | "medium" | "hard";
type Turn =
  | { role: "tutor"; text: string; translation: string }
  | { role: "learner"; text: string; corrected?: string; explanation?: string };

/** Conversation partner that talks using a song's words and the learner's saved words. */
export function Tutor() {
  const { t } = usePreferences();
  const songs = useSongs();
  const saved = savedWordsStore.useValue();
  const [songId, setSongId] = useState(songs[0]?.id ?? "");
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const meaning = useMeaningLang(song.language) ?? (song.language === "en" ? "fr" : "en");
  const [level, setLevel] = useState<Level>("easy");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiFailure | null>(null);
  const [shown, setShown] = useState<Set<number>>(new Set());

  const words = useMemo(() => {
    const sameLanguage = new Set(songs.filter((s) => s.language === song.language).map((s) => s.id));
    const mine = saved.filter((w) => sameLanguage.has(w.songId)).map((w) => w.word.toLowerCase());
    return [...new Set([...mine, ...songVocabulary(song)])].slice(0, 120);
  }, [songs, saved, song]);

  async function ask(history: Turn[]) {
    setBusy(true);
    setError(null);
    const outcome = await callAi("tutor", {
      learn: song.language,
      meaning,
      level,
      song: song.title,
      words,
      history: history.slice(-30).map((turn) => ({ role: turn.role, text: turn.text })),
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.reason);
      return;
    }
    const answer: TutorResult = outcome.data;
    const next = [...history];
    const last = next.at(-1);
    if (last?.role === "learner" && answer.has_mistake && answer.corrected.trim()) {
      next[next.length - 1] = { ...last, corrected: answer.corrected, explanation: answer.explanation };
    }
    setTurns([...next, { role: "tutor", text: answer.reply, translation: answer.translation }]);
  }

  function send() {
    const message = text.trim();
    if (!message || busy) return;
    const history: Turn[] = [...turns, { role: "learner", text: message }];
    setTurns(history);
    setText("");
    recordActivity();
    void ask(history);
  }

  const learnDir = directionOf(song.language);
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"}`;

  return (
    <section className="space-y-4 pt-4">
      <h1 className="text-3xl font-bold">{t.tutor.title}</h1>
      <p className="text-muted">{t.tutor.words}</p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium">{t.tutor.song}</span>
          <select
            value={song.id}
            onChange={(e) => {
              setSongId(e.target.value);
              setTurns([]);
            }}
            className="rounded-xl border border-border bg-surface px-3 py-2"
          >
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1.5" role="radiogroup" aria-label={t.tutor.level}>
          {(["easy", "medium", "hard"] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={level === l} className={chip(level === l)} onClick={() => setLevel(l)}>
              {t.ai[l]}
            </button>
          ))}
        </div>
      </div>

      {turns.length === 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void ask([])}
          className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? t.ai.loading : t.tutor.start}
        </button>
      ) : (
        <ol className="space-y-3" aria-label={t.tutor.title}>
          {turns.map((turn, i) =>
            turn.role === "tutor" ? (
              <li key={i} className="max-w-[85%] rounded-2xl rounded-ss-sm bg-surface p-3">
                <p className="text-lg" lang={song.language} dir={learnDir}>
                  {turn.text}
                </p>
                <div className="mt-1 flex gap-3 text-sm text-muted">
                  <button type="button" onClick={() => speak(turn.text, song.speechLang)} aria-label={t.player.listen}>
                    🔊
                  </button>
                  <button
                    type="button"
                    onClick={() => setShown((all) => new Set(all).add(i))}
                    className={shown.has(i) ? "hidden" : "underline"}
                  >
                    {t.tutor.translation}
                  </button>
                </div>
                {shown.has(i) && <p className="mt-1 text-sm text-muted">{turn.translation}</p>}
              </li>
            ) : (
              <li key={i} className="ms-auto max-w-[85%] rounded-2xl rounded-se-sm bg-accent-soft p-3">
                <p className="text-lg" lang={song.language} dir={learnDir}>
                  {turn.text}
                </p>
                {turn.corrected && (
                  <div className="mt-2 border-t border-border pt-2 text-sm">
                    <p>
                      <span className="font-semibold">{t.tutor.better}</span>{" "}
                      <span lang={song.language} dir={learnDir}>
                        {turn.corrected}
                      </span>
                    </p>
                    {turn.explanation && <p className="text-muted">{turn.explanation}</p>}
                  </div>
                )}
              </li>
            ),
          )}
          {busy && <li className="text-muted">{t.ai.loading}</li>}
        </ol>
      )}

      {error && <AiNotice state={{ status: "error", reason: error }} />}

      {turns.length > 0 && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder={t.tutor.placeholder}
            aria-label={t.tutor.placeholder}
            lang={song.language}
            dir={learnDir}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3"
          />
          <button type="submit" disabled={busy || !text.trim()} className="rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50">
            {t.tutor.send}
          </button>
        </form>
      )}
      {turns.length > 0 && (
        <button type="button" onClick={() => setTurns([])} className="text-sm text-muted underline">
          {t.tutor.newChat}
        </button>
      )}
    </section>
  );
}
