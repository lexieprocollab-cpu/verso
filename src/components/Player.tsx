"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LANGUAGE_NAMES, UI_LANGUAGES, directionOf, format, isUiLanguage } from "@/lib/i18n";
import {
  LYRIC_COLORS,
  playerSettingsStore,
  speak,
  updatePlayerSettings,
  type LyricColor,
  type LyricSize,
  type TranslationMode,
} from "@/lib/learnerStores";
import { findPhrases, formatTime, lineIndexAt, phraseKey, wordIndexAt, wordsBetween, type Song } from "@/lib/song";
import { canSaveOffline, offlineSongsStore, removeOffline, saveOffline, type OfflineProblem } from "@/lib/offline";
import { usePremium } from "@/lib/subscription";
import { addListening } from "@/lib/stats";
import { usePlayback } from "@/lib/usePlayback";
import { AiNotice } from "./AiNotice";
import { usePreferences } from "./Preferences";
import { TappableText } from "./TappableText";
import { useAi } from "./useAi";
import { useMeaningLang } from "./useMeaningLang";
import { useUnderstood } from "./useProgress";
import { SongVideo, useSongSource } from "./useSongSource";
import { WordCard, type WordSelection } from "./WordCard";

const SIZE_CLASS: Record<LyricSize, string> = { s: "text-lg", m: "text-2xl", l: "text-3xl", xl: "text-4xl" };
const COLOR_VALUE: Record<LyricColor, string> = {
  default: "var(--lyric)",
  violet: "#7c5cff",
  teal: "#0f9f8f",
  rose: "#e0457b",
  amber: "#d98a00",
};

/** `compact` embeds the player in another screen (the timing tool preview): no sticky header, no end padding. */
export function Player({ song, startLine, compact = false }: { song: Song; startLine: number | null; compact?: boolean }) {
  const { t } = usePreferences();
  const settings = playerSettingsStore.useValue();
  const meaningLang = useMeaningLang(song.language);
  const startTime = startLine !== null && song.lines[startLine] ? song.lines[startLine].start : 0;
  const { source, videoId, videoRef } = useSongSource(song);
  const { time, playing, rate, loop, duration, play, pause, seek, setRate, setLoop } = usePlayback(song.duration, startTime, source);

  const [selection, setSelection] = useState<WordSelection | null>(null);
  // Phrase picking: off, waiting for the first word, or holding the first word.
  const [picking, setPicking] = useState<{ line: number; from: number } | "start" | null>(null);

  function onWord(line: number, key: string, word: string, index: number) {
    if (picking === null) return setSelection({ key, word, line, index });
    if (picking === "start" || picking.line !== line) return setPicking({ line, from: index });
    const text = wordsBetween(song.lines[line].text, picking.from, index);
    setPicking(null);
    setSelection(picking.from === index ? { key, word, line, index } : { key: phraseKey(text), word: text, line });
  }
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const [showDisplay, setShowDisplay] = useState(false);
  const [explained, setExplained] = useState<number | null>(null);
  const explain = useAi("explain");
  const understood = useUnderstood(song);
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);

  const current = lineIndexAt(song.lines, time);
  const focusLine = Math.max(current, 0);

  function explainLine() {
    setExplained(focusLine);
    void explain.run({ line: song.lines[focusLine].text, learn: song.language, meaning: meaningLang ?? "en" });
  }

  // Listening time for the progress stats, counted in 5-second steps.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => addListening(5), 5000);
    return () => clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (current >= 0) lineRefs.current[current]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current]);

  function toggleRepeat() {
    const line = song.lines[focusLine];
    setLoop(loop ? null : { start: line.start, end: line.end });
    if (!loop) seek(line.start);
  }

  const lyricStyle: CSSProperties = { color: COLOR_VALUE[settings.color] };

  return (
    <section className="pt-2">
      {videoId && <SongVideo videoRef={videoRef} title={`${song.title} — ${song.artist}`} />}
      <div className={`${compact ? "" : "sticky top-0 z-10"} -mx-4 border-b border-border bg-bg/95 px-4 pt-2 pb-3 backdrop-blur`}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold" dir="ltr">
              {song.title}
            </h1>
            <p className="truncate text-sm text-muted" dir="ltr">
              {song.artistSlug ? (
                <Link href={`/artists/${song.artistSlug}`} className="underline">
                  {song.artist}
                </Link>
              ) : (
                song.artist
              )}
            </p>
          </div>
          <Link href={`/practice/quiz?song=${song.id}`} className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
            {t.player.takeQuiz}
          </Link>
        </div>

        <div className="mt-3 flex items-center gap-3" dir="ltr">
          <button
            type="button"
            onClick={playing ? pause : play}
            aria-label={playing ? t.player.pause : t.player.play}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-white"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
            className="min-w-0 flex-1 accent-[var(--accent)]"
          />
          <span className="shrink-0 text-sm tabular-nums text-muted">
            {formatTime(time)} / {formatTime(duration)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Chip active={loop !== null} onClick={toggleRepeat}>
            🔁 {t.player.repeatLine}
          </Chip>
          <Chip active={rate !== 1} onClick={() => setRate(rate === 1 ? 0.75 : 1)}>
            🐢 {t.player.slow} <bdi dir="ltr">0.75×</bdi>
          </Chip>
          <Chip active={false} onClick={() => speak(song.lines[focusLine].text, song.speechLang, rate === 1 ? 0.9 : 0.7)}>
            🔊 {t.player.listen}
          </Chip>
          <Chip active={picking !== null} onClick={() => setPicking(picking === null ? "start" : null)}>
            🔗 {picking === null ? t.phrase.select : t.phrase.cancel}
          </Chip>
          <Chip active={explained !== null} onClick={explainLine}>
            ✨ {t.ai.explainLine}
          </Chip>
          <Chip active={showDisplay} onClick={() => setShowDisplay(!showDisplay)}>
            Aa {t.player.display}
          </Chip>
          {!compact && <OfflineChip song={song} />}
        </div>

        {picking !== null && (
          <p className="mt-3 rounded-xl bg-amber-300/30 px-3 py-2 text-sm font-medium">🔗 {t.phrase.pickEnd}</p>
        )}

        {showDisplay && <DisplaySettings song={song} />}

        {explained !== null && (
          <div className="relative mt-3 rounded-2xl border border-accent/40 bg-surface p-3 text-sm">
            <button
              type="button"
              onClick={() => {
                setExplained(null);
                explain.reset();
              }}
              aria-label={t.word.close}
              className="absolute end-2 top-2 rounded-full px-2 text-muted"
            >
              ✕
            </button>
            <p className="pe-6 font-semibold" dir={directionOf(song.language)}>
              {song.lines[explained].text}
            </p>
            <AiNotice state={explain.state} />
            {explain.state.status === "done" && (
              <dl className="mt-2 space-y-1.5" dir={meaningLang ? directionOf(meaningLang) : undefined}>
                <div>
                  <dt className="inline font-semibold">{t.ai.meaning}: </dt>
                  <dd className="inline">{explain.state.data.meaning}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">{t.word.grammar}: </dt>
                  <dd className="inline">{explain.state.data.grammar}</dd>
                </div>
                {explain.state.data.culture && (
                  <div>
                    <dt className="inline font-semibold">{t.ai.culture}: </dt>
                    <dd className="inline">{explain.state.data.culture}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3 text-sm">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div className="h-full rounded-full bg-green-500" style={{ width: `${understood}%` }} />
        </div>
        <span className="shrink-0 font-medium">{format(t.more.understood, { n: understood })}</span>
      </div>

      {!song.audioUrl && <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm">{t.player.demoNote}</p>}

      <ol className={`mt-4 space-y-5 ${compact ? "max-h-96 overflow-y-auto pb-4" : "pb-[40vh]"}`} dir={directionOf(song.language)}>
        {song.lines.map((line, i) => {
          const isCurrent = i === current;
          const translation = meaningLang ? line.translations[meaningLang] : undefined;
          const showTranslation =
            translation && (settings.translation === "always" || (settings.translation === "tap" && revealed.has(i)));
          return (
            <li
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
              className={`transition-opacity ${isCurrent ? "opacity-100" : "opacity-45"}`}
            >
              <p
                className={`${SIZE_CLASS[settings.size]} leading-snug ${isCurrent ? "font-bold" : "font-medium"}`}
                style={lyricStyle}
              >
                <TappableText
                  text={line.text}
                  highlight={isCurrent ? wordIndexAt(line, time) : -1}
                  onWord={(key, word, index) => onWord(i, key, word, index)}
                  phrases={findPhrases(line.text, song.phrases)}
                  selected={picking !== null && picking !== "start" && picking.line === i ? [picking.from, picking.from] : null}
                />
              </p>
              {showTranslation && (
                <p className="mt-1 text-base text-muted" dir={meaningLang ? directionOf(meaningLang) : undefined}>
                  {translation}
                </p>
              )}
              {translation && settings.translation === "tap" && !revealed.has(i) && (
                <button
                  type="button"
                  onClick={() => setRevealed(new Set(revealed).add(i))}
                  className="mt-1 text-sm font-medium text-accent"
                >
                  {t.player.translate}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {selection && (
        <WordCard song={song} selection={selection} meaningLang={meaningLang} onClose={() => setSelection(null)} onSelect={setSelection} />
      )}
    </section>
  );
}

/** Save the song for offline use (subscribers; not for YouTube songs). */
function OfflineChip({ song }: { song: Song }) {
  const { t } = usePreferences();
  const premium = usePremium();
  const saved = offlineSongsStore.useValue().some((s) => s.id === song.id);
  const [state, setState] = useState<"idle" | "saving" | OfflineProblem | "premium">("idle");
  if (!canSaveOffline(song)) return null;

  async function toggle() {
    if (saved) return void removeOffline(song);
    if (!premium) return setState("premium");
    setState("saving");
    const outcome = await saveOffline(song);
    setState(outcome.ok ? "idle" : outcome.problem);
  }

  const note = state === "premium" ? t.offline.premium : state === "failed" ? t.offline.failed : state === "unsupported" ? t.offline.unsupported : null;
  return (
    <>
      <Chip active={saved} onClick={() => void toggle()}>
        {saved ? t.offline.saved : state === "saving" ? t.offline.saving : `⬇ ${t.offline.save}`}
      </Chip>
      {note && (
        <p className="w-full text-xs text-muted">
          {note}{" "}
          {state === "premium" && (
            <Link href="/settings" className="font-semibold text-accent">
              {t.paywall.subscribe}
            </Link>
          )}
        </p>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 font-medium ${
        active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

function DisplaySettings({ song }: { song: Song }) {
  const { t, lang } = usePreferences();
  const settings = playerSettingsStore.useValue();
  const speakValue = settings.speak ?? lang;
  const modes: [TranslationMode, string][] = [
    ["always", t.player.transAlways],
    ["tap", t.player.transTap],
    ["off", t.player.transOff],
  ];
  const sizes: LyricSize[] = ["s", "m", "l", "xl"];

  return (
    <div className="mt-3 grid gap-3 rounded-2xl border border-border bg-surface p-3 text-sm">
      <label className="flex items-center justify-between gap-3">
        <span className="font-medium">{t.player.iSpeak}</span>
        <select
          value={speakValue}
          onChange={(e) => isUiLanguage(e.target.value) && updatePlayerSettings({ speak: e.target.value })}
          className="rounded-lg border border-border bg-bg px-2 py-1.5"
        >
          {UI_LANGUAGES.filter((code) => code !== song.language).map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{t.player.translation}</span>
        <div className="flex gap-1">
          {modes.map(([mode, label]) => (
            <Chip key={mode} active={settings.translation === mode} onClick={() => updatePlayerSettings({ translation: mode })}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{t.player.textSize}</span>
        <div className="flex gap-1" dir="ltr">
          {sizes.map((size) => (
            <Chip key={size} active={settings.size === size} onClick={() => updatePlayerSettings({ size })}>
              {size.toUpperCase()}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{t.player.lyricColor}</span>
        <div className="flex gap-2">
          {LYRIC_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={settings.color === color}
              onClick={() => updatePlayerSettings({ color })}
              className={`size-7 rounded-full border-2 ${settings.color === color ? "border-accent" : "border-border"}`}
              style={{ background: COLOR_VALUE[color] }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
