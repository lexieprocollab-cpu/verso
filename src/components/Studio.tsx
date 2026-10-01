"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { callAi } from "@/lib/ai/client";
import { LANGUAGE_NAMES, UI_LANGUAGES, directionOf, isUiLanguage, type UiLanguage } from "@/lib/i18n";
import { checkAudio, type ArtistError } from "@/lib/artistClient";
import { saveLocalSong } from "@/lib/localSongs";
import { formatTime, lineWords, type Song } from "@/lib/song";
import { EMPTY_DRAFT, draftLines, draftWordCount, songFromDraft, studioDraftStore, updateDraft, type StudioDraft } from "@/lib/studio";
import { lrcToTaps, parseLrc } from "@/lib/lrc";
import { isYouTubeId, type MediaSource } from "@/lib/media";
import { usePlayback } from "@/lib/usePlayback";
import { useArtists } from "./artists/useArtists";
import { useLive } from "./rooms/useRooms";
import { Player } from "./Player";
import { SongVideo } from "./useSongSource";

// Song timing tool (step 5): details → audio → lyrics → tap along → translations → preview & save.
// A team tool, so it's in English only.

export function Studio() {
  const draft = studioDraftStore.useValue();
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLDivElement | null>(null);
  const youtubeId = isYouTubeId(draft.youtubeId ?? "") ? draft.youtubeId! : null;
  const audioSrc = fileUrl ?? (draft.audioUrl.trim() || undefined);
  const source: string | MediaSource | undefined = youtubeId ? (videoElement ? { kind: "youtube", videoId: youtubeId, element: videoElement } : undefined) : audioSrc;
  const playback = usePlayback(600, 0, source);
  const lines = useMemo(() => draftLines(draft), [draft]);
  const totalWords = useMemo(() => draftWordCount(draft), [draft]);
  const result = songFromDraft(draft, playback.duration, youtubeId ? undefined : audioSrc);
  const hasSound = Boolean(youtubeId ?? audioSrc);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);

  return (
    <section className="space-y-5 pt-4 pb-10" dir="ltr">
      <div>
        <h1 className="text-3xl font-bold">Song timing tool</h1>
        <p className="mt-1 text-muted">
          Add a song in about 30 minutes: details, audio, lyrics, tap along to time every word, check the AI translations,
          then preview and save. Your work is kept on this device as you go.
        </p>
      </div>

      <Step n={1} title="Song details" done={Boolean(draft.title && draft.artist && draft.license)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input value={draft.title} onChange={(e) => updateDraft({ title: e.target.value })} className={input} />
          </Field>
          <Field label="Artist">
            <input value={draft.artist} onChange={(e) => updateDraft({ artist: e.target.value })} className={input} />
          </Field>
          <Field label="Song language">
            <select
              value={draft.language}
              onChange={(e) => isUiLanguage(e.target.value) && updateDraft({ language: e.target.value })}
              className={input}
            >
              {UI_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Level">
            <select
              value={draft.level}
              onChange={(e) => updateDraft({ level: e.target.value as StudioDraft["level"] })}
              className={input}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </Field>
          <Field label="License (who allows us to use it)" wide>
            <input
              value={draft.license}
              onChange={(e) => updateDraft({ license: e.target.value })}
              placeholder="e.g. CC-BY-4.0, artist upload agreement, original"
              className={input}
            />
          </Field>
        </div>
      </Step>

      <Step n={2} title="Audio" done={hasSound}>
        <div className="grid gap-3">
          <Field label="Audio file from this device (used for this session)">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setFileUrl(URL.createObjectURL(file));
                  setAudioFile(file);
                }
              }}
              className="text-sm"
            />
          </Field>
          <Field label="…or a web address of the audio (kept with the song)">
            <input
              value={draft.audioUrl}
              onChange={(e) => updateDraft({ audioUrl: e.target.value })}
              placeholder="https://…/song.mp3"
              className={input}
            />
          </Field>
          <Field label="…or the official YouTube video (licensed songs: the video plays instead of an audio file)">
            <input
              value={draft.youtubeId ?? ""}
              onChange={(e) => updateDraft({ youtubeId: youTubeIdFrom(e.target.value) })}
              placeholder="https://www.youtube.com/watch?v=… or the 11-character video id"
              className={input}
            />
          </Field>
          {youtubeId && <SongVideo videoRef={setVideoElement} title={draft.title || "Song video"} />}
          {hasSound && (
            <p className="text-sm text-muted">
              Length: {playback.duration < 600 ? formatTime(playback.duration) : "loading…"}
            </p>
          )}
        </div>
      </Step>

      <Step n={3} title="Lyrics" done={lines.length > 0}>
        <textarea
          value={draft.lyrics}
          onChange={(e) => updateDraft({ lyrics: e.target.value, taps: [] })}
          rows={8}
          dir={directionOf(draft.language)}
          placeholder="Paste the lyrics, one sung line per row."
          className={`${input} font-medium`}
        />
        <p className="mt-1 text-sm text-muted">
          {lines.length} lines · {totalWords} words. Editing the lyrics clears the timing.
        </p>
        <Field label="Have timed lyrics? Import an LRC file (from a lyrics provider or another tool) — it fills the lyrics and the timing.">
          <input
            type="file"
            accept=".lrc,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const lrc = parseLrc(await file.text());
              const imported = lrcToTaps(lrc, playback.duration < 600 ? playback.duration : (lrc.lines.at(-1)?.start ?? 0) + 5);
              if (!imported.lyrics) return alert("No timed lyric lines found in this file.");
              updateDraft({
                ...imported,
                title: draft.title || lrc.title || "",
                artist: draft.artist || lrc.artist || "",
              });
              e.target.value = "";
            }}
            className="text-sm"
          />
        </Field>
      </Step>

      <Step n={4} title="Tap along" done={draft.taps.length >= totalWords && totalWords > 0}>
        <TapAlong draft={draft} lines={lines} totalWords={totalWords} playback={playback} hasAudio={hasSound} />
      </Step>

      <Step n={5} title="Translations" done={Object.values(draft.translations).some((list) => list?.some(Boolean))}>
        <Translations draft={draft} lines={lines} />
      </Step>

      <Step n={6} title="Preview and save" done={saved !== null}>
        {result.song ? (
          <>
            <div className="rounded-2xl border border-border bg-bg px-4">
              <Player key={`${result.song.id}:${draft.taps.length}`} song={result.song} startLine={null} compact />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  saveLocalSong(result.song);
                  setSaved(result.song.id);
                }}
                className="rounded-xl bg-accent px-4 py-3 font-semibold text-white"
              >
                Add to my catalog
              </button>
              <button type="button" onClick={() => download(result.song)} className="rounded-xl border border-border px-4 py-3 font-medium">
                Download song file (JSON)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Start a new song? This clears the current draft.")) {
                    studioDraftStore.set(EMPTY_DRAFT);
                    setFileUrl(null);
                    setAudioFile(null);
                    setSaved(null);
                  }
                }}
                className="rounded-xl border border-border px-4 py-3 font-medium text-muted"
              >
                New song
              </button>
            </div>
            {saved && (
              <p className="mt-2 text-sm">
                Saved on this device.{" "}
                <Link href={`/player?song=${saved}`} className="font-semibold text-accent">
                  Open it in the player
                </Link>
                {fileUrl && !draft.audioUrl && " — the audio file isn't stored; add a web address to keep the sound."}
              </p>
            )}
            <SubmitForReview song={result.song} audio={audioFile} />
          </>
        ) : (
          <p className="text-muted">Still needed: {result.missing.map(describeMissing).join(", ")}.</p>
        )}
      </Step>
    </section>
  );
}

const input = "w-full rounded-lg border border-border bg-bg px-3 py-2";

function describeMissing(item: string) {
  if (item.startsWith("translation:")) {
    return `finish the ${LANGUAGE_NAMES[item.split(":")[1] as UiLanguage]} translation`;
  }
  return item === "timing" ? "tap every word" : item;
}

function download(song: object & { id: string }) {
  const blob = new Blob([JSON.stringify(song, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${song.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <span
          className={`grid size-7 place-items-center rounded-full text-sm ${done ? "bg-green-500 text-white" : "bg-accent-soft text-accent"}`}
        >
          {done ? "✓" : n}
        </span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`grid gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function TapAlong({
  draft,
  lines,
  totalWords,
  playback,
  hasAudio,
}: {
  draft: StudioDraft;
  lines: string[];
  totalWords: number;
  playback: ReturnType<typeof usePlayback>;
  hasAudio: boolean;
}) {
  const { time, playing, rate, play, pause, seek, setRate, now } = playback;
  const next = draft.taps.length;
  const done = next >= totalWords && totalWords > 0;
  const tapRef = useRef<() => void>(() => {});

  const tap = useCallback(() => {
    if (!playing || done) return;
    const at = now();
    const last = draft.taps[draft.taps.length - 1] ?? -1;
    if (at > last) updateDraft({ taps: [...draft.taps, at] });
  }, [playing, done, now, draft.taps]);

  useEffect(() => {
    tapRef.current = tap;
  }, [tap]);

  // Space bar taps (outside text fields); Backspace undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        tapRef.current();
      } else if (e.code === "Backspace") {
        e.preventDefault();
        updateDraft({ taps: studioDraftStore.get().taps.slice(0, -1) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!hasAudio) return <p className="text-muted">Add the audio first.</p>;
  if (totalWords === 0) return <p className="text-muted">Add the lyrics first.</p>;

  let wordIndex = 0;
  return (
    <div>
      <p className="text-sm text-muted">
        Press play, then tap the big button (or the space bar) the moment each highlighted word starts. Slow the song
        down for fast parts. Backspace undoes a tap.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={playing ? pause : play} className="rounded-xl bg-accent px-4 py-2 font-semibold text-white">
          {playing ? "Pause" : "Play"}
        </button>
        <span className="text-sm tabular-nums">{formatTime(time)}</span>
        {[0.5, 0.75, 1].map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => setRate(speed)}
            aria-pressed={rate === speed}
            className={`rounded-full border px-3 py-1 text-sm ${rate === speed ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
          >
            {speed}×
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const taps = draft.taps.slice(0, -1);
            updateDraft({ taps });
            seek(Math.max(0, (taps[taps.length - 1] ?? 0) - 1));
          }}
          disabled={next === 0}
          className="rounded-full border border-border px-3 py-1 text-sm disabled:opacity-40"
        >
          Undo tap
        </button>
        <button
          type="button"
          onClick={() => {
            updateDraft({ taps: [] });
            seek(0);
          }}
          className="rounded-full border border-border px-3 py-1 text-sm"
        >
          Start over
        </button>
      </div>

      <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border bg-bg p-3 text-lg leading-relaxed" dir={directionOf(draft.language)}>
        {lines.map((line, i) => (
          <p key={i}>
            {lineWords(line).map((word, j) => {
              const index = wordIndex++;
              const state = index < next ? "text-green-600 dark:text-green-400" : index === next ? "rounded bg-accent px-1 text-white" : "text-muted";
              return (
                <span key={j} className={`${state} me-1.5 inline-block`}>
                  {word}
                </span>
              );
            })}
          </p>
        ))}
      </div>

      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          tap();
        }}
        disabled={!playing || done}
        className="mt-3 w-full select-none rounded-2xl bg-accent py-8 text-2xl font-bold text-white disabled:opacity-40"
      >
        {done ? "All words timed ✓" : playing ? "TAP" : "Press play to start"}
      </button>
      <p className="mt-1 text-sm text-muted">
        {Math.min(next, totalWords)} / {totalWords} words timed
      </p>
    </div>
  );
}

function Translations({ draft, lines }: { draft: StudioDraft; lines: string[] }) {
  const targets = UI_LANGUAGES.filter((code) => code !== draft.language);
  const [lang, setLang] = useState<UiLanguage>(targets[0]);
  const [status, setStatus] = useState<string | null>(null);
  const target = targets.includes(lang) ? lang : targets[0];
  const list = draft.translations[target] ?? [];

  async function draftWithAi() {
    setStatus("AI is translating…");
    const outcome = await callAi("translate", { lines, learn: draft.language, target });
    if (!outcome.ok) {
      setStatus(outcome.reason === "not_configured" ? "AI isn't connected yet — add the Claude API key, or type the translations." : "Couldn't translate right now. Try again.");
      return;
    }
    updateDraft({ translations: { ...studioDraftStore.get().translations, [target]: outcome.data.translations } });
    setStatus("Draft ready — read every line and fix anything that sounds wrong.");
  }

  function setLine(i: number, text: string) {
    const next = lines.map((_, j) => (j === i ? text : (list[j] ?? "")));
    updateDraft({ translations: { ...draft.translations, [target]: next } });
  }

  if (lines.length === 0) return <p className="text-muted">Add the lyrics first.</p>;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {targets.map((code) => {
          const filled = (draft.translations[code] ?? []).filter((t) => t?.trim()).length;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              aria-pressed={code === target}
              className={`rounded-full border px-3 py-1 text-sm ${code === target ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
            >
              {LANGUAGE_NAMES[code]} {filled === lines.length ? "✓" : filled ? `${filled}/${lines.length}` : ""}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={draftWithAi} className="mt-3 rounded-xl border border-accent px-4 py-2 font-medium text-accent">
        ✨ Draft {LANGUAGE_NAMES[target]} with AI
      </button>
      {status && <p className="mt-2 text-sm text-muted">{status}</p>}
      <ol className="mt-3 grid gap-2">
        {lines.map((line, i) => (
          <li key={i} className="grid gap-1 sm:grid-cols-2 sm:gap-3">
            <span className="text-sm font-medium" dir={directionOf(draft.language)}>
              {line}
            </span>
            <input
              value={list[i] ?? ""}
              onChange={(e) => setLine(i, e.target.value)}
              dir={directionOf(target)}
              className={input}
              aria-label={`${LANGUAGE_NAMES[target]} translation of line ${i + 1}`}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

const SUBMIT_ERRORS: Record<ArtistError, string> = {
  sign_in_required: "Sign in first (Settings).",
  artist_needed: "Create your artist page first.",
  slug_taken: "That page address is taken.",
  bad_audio: "The audio must be an audio file (MP3, M4A, OGG, WAV, WebM or FLAC) up to 20 MB.",
  audio_needed: "Pick the audio file in step 2 — it's uploaded with the song.",
  too_many_pending: "You have 5 songs waiting for review. Please wait for those first.",
  not_allowed: "This upload isn't allowed.",
  failed: "Something went wrong. Try again.",
};

/** Artists send the finished song to Verso; it's published after a moderator approves it. */
function SubmitForReview({ song, audio }: { song: Song; audio: File | null }) {
  const artists = useArtists();
  const [mine] = useLive(artists ? () => artists.mine() : null, null, [artists]);
  const [rights, setRights] = useState(false);
  const [state, setState] = useState<{ kind: "idle" | "sending" } | { kind: "done"; id: string } | { kind: "error"; error: ArtistError }>({ kind: "idle" });

  if (!artists || mine === undefined) return null;
  const artist = mine && mine !== "signed_out" ? mine : null;

  async function submit() {
    if (!artists) return;
    setState({ kind: "sending" });
    const outcome = await artists.submit(song, audio);
    setState(outcome.ok ? { kind: "done", id: outcome.id } : { kind: "error", error: outcome.error });
  }

  return (
    <div className="mt-5 space-y-3 rounded-2xl border border-border p-4">
      <h3 className="font-semibold">Submit to Verso (artists)</h3>
      {!artist ? (
        <p className="text-sm text-muted">
          Are you the artist?{" "}
          <Link href="/artists" className="font-semibold text-accent">
            Create your artist page
          </Link>{" "}
          to send this song for review and get it published.
        </p>
      ) : state.kind === "done" ? (
        <p className="text-sm">
          Sent! It&apos;s waiting for review — follow it on{" "}
          <Link href="/artists" className="font-semibold text-accent">
            your artist page
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            It will appear as <strong>{artist.name}</strong>
            {artists.kind === "cloud" ? (audio ? `, with the audio file “${audio.name}”.` : ". Pick the audio file in step 2 first.") : "."}
          </p>
          {audio && !checkAudio(audio) && <p className="text-sm text-red-600">{SUBMIT_ERRORS.bad_audio}</p>}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1" />
            <span>I wrote and recorded this song or have permission from everyone who owns it, and Verso may stream it and show its lyrics and translations to learners.</span>
          </label>
          <button
            type="button"
            disabled={!rights || state.kind === "sending"}
            onClick={() => void submit()}
            className="rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {state.kind === "sending" ? "Sending…" : "Submit for review"}
          </button>
          {state.kind === "error" && (
            <p role="alert" className="text-sm text-red-600">
              {SUBMIT_ERRORS[state.error]}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Accepts a YouTube link (watch, youtu.be, shorts, embed) or a bare video id. */
function youTubeIdFrom(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : trimmed;
}
