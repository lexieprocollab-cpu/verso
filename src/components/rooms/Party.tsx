"use client";

import { useEffect, useRef, useState } from "react";
import { directionOf, format } from "@/lib/i18n";
import {
  HEARTBEAT_MS,
  HOST_TIMEOUT_MS,
  REACTIONS,
  activeMembers,
  needsResync,
  parsePartyMessage,
  positionNow,
  type Anchor,
  type Member,
  type PartyMessage,
  type Reaction,
} from "@/lib/party";
import type { OwnProfile, PartyChannel, RoomsBackend } from "@/lib/rooms/backend";
import { formatTime, lineIndexAt, wordIndexAt, type Song } from "@/lib/song";
import { usePlayback } from "@/lib/usePlayback";
import { usePreferences } from "../Preferences";
import { TappableText } from "../TappableText";
import { useMeaningLang } from "../useMeaningLang";
import { SongVideo, useSongSource } from "../useSongSource";
import { WordCard, type WordSelection } from "../WordCard";

type Playback = ReturnType<typeof usePlayback>;
type Floating = { id: number; emoji: Reaction; x: number };

const stateOf = (me: OwnProfile, position: number, playing: boolean): PartyMessage => ({ type: "state", from: me.id, name: me.name, position, playing });

/** Listening party: the host's play, pause and seek reach everyone; reactions float over the running line. */
export function Party({ rooms, song, me }: { rooms: RoomsBackend; song: Song; me: OwnProfile }) {
  const { t } = usePreferences();
  const meaning = useMeaningLang(song.language);
  const { source, videoId, videoRef } = useSongSource(song);
  const playback = usePlayback(song.duration, 0, source);
  const [hostId, setHostId] = useState<string | null>(null);
  const [hostName, setHostName] = useState("");
  const [hostPlaying, setHostPlaying] = useState(false);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [floating, setFloating] = useState<Floating[]>([]);
  const [ended, setEnded] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [selection, setSelection] = useState<WordSelection | null>(null);
  const channel = useRef<PartyChannel | null>(null);
  const live = useRef<{ playback: Playback; hostId: string | null; lastStateAt: number; anchor: Anchor | null; nextFloat: number }>({
    playback,
    hostId: null,
    lastStateAt: 0,
    anchor: null,
    nextFloat: 0,
  });

  useEffect(() => {
    live.current.playback = playback;
  });

  function float(emoji: Reaction) {
    const id = ++live.current.nextFloat;
    setFloating((all) => [...all.slice(-20), { id, emoji, x: 10 + Math.random() * 80 }]);
    setTimeout(() => setFloating((all) => all.filter((f) => f.id !== id)), 2600);
  }

  function follow(position: number, playing: boolean) {
    const p = live.current.playback;
    if (needsResync(p.now(), position)) p.seek(position);
    if (playing) p.play();
    else p.pause();
  }

  useEffect(() => {
    const ch = rooms.partyChannel(song.id);
    channel.current = ch;
    const state = live.current;

    const becomeGuestOf = (id: string | null, name = "") => {
      state.hostId = id;
      setHostId(id);
      setHostName(name);
    };

    ch.onMessage((raw) => {
      const m = parsePartyMessage(raw);
      if (!m || m.from === me.id) return;
      const now = Date.now();
      if (m.type !== "end") setMembers((all) => ({ ...all, [m.from]: { name: m.name, seenAt: now } }));
      if (m.type === "hello" && state.hostId === me.id) ch.send(stateOf(me, state.playback.now(), state.playback.playing));
      if (m.type === "react") float(m.emoji);
      if (m.type === "end" && m.from === state.hostId) {
        becomeGuestOf(null);
        setEnded(true);
        state.playback.pause();
      }
      if (m.type === "state") {
        // Two people pressed Start at once: the smaller id keeps hosting.
        if (state.hostId === me.id && me.id < m.from) return;
        if (state.hostId !== m.from) becomeGuestOf(m.from, m.name);
        setEnded(false);
        setHostPlaying(m.playing);
        state.lastStateAt = now;
        state.anchor = { position: m.position, playing: m.playing, receivedAt: now };
        follow(m.position, m.playing);
      }
    });
    ch.send({ type: "hello", from: me.id, name: me.name });

    const timer = setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (state.hostId === me.id) ch.send(stateOf(me, state.playback.now(), state.playback.playing));
      else ch.send({ type: "ping", from: me.id, name: me.name });
      if (state.hostId && state.hostId !== me.id && now - state.lastStateAt > HOST_TIMEOUT_MS) {
        becomeGuestOf(null);
        setEnded(true);
        state.playback.pause();
      }
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(timer);
      if (state.hostId === me.id) ch.send({ type: "end", from: me.id });
      state.playback.pause();
      ch.close();
    };
    // follow and float only touch refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, song.id, me.id, me.name]);

  const isHost = hostId === me.id;
  const send = (message: PartyMessage) => channel.current?.send(message);

  function start() {
    live.current.hostId = me.id;
    setHostId(me.id);
    setEnded(false);
    send(stateOf(me, playback.now(), playback.playing));
  }
  function hostToggle() {
    if (playback.playing) playback.pause();
    else playback.play();
    send(stateOf(me, playback.now(), !playback.playing));
  }
  function hostSeek(to: number) {
    playback.seek(to);
    send(stateOf(me, to, playback.playing));
  }
  function end() {
    send({ type: "end", from: me.id });
    live.current.hostId = null;
    setHostId(null);
    playback.pause();
  }
  function listenAlong() {
    const anchor = live.current.anchor;
    if (anchor) follow(positionNow(anchor, Date.now(), playback.duration), anchor.playing);
  }
  function react(emoji: Reaction) {
    float(emoji);
    send({ type: "react", from: me.id, name: me.name, emoji });
  }

  const listening = activeMembers(members, clock).length + 1;
  const index = lineIndexAt(song.lines, playback.time);
  const line = song.lines[Math.max(index, 0)];
  const next = song.lines[Math.max(index, 0) + 1];
  const translation = meaning ? line.translations[meaning] : undefined;

  if (!hostId) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 text-center">
        <p className="text-4xl" aria-hidden>
          🎧
        </p>
        <h2 className="text-xl font-bold">{t.party.title}</h2>
        <p className="text-muted">{t.party.intro}</p>
        {ended && <p className="text-sm text-muted">{t.party.ended}</p>}
        <p className="text-sm text-muted">{format(t.party.listening, { n: listening })}</p>
        <button type="button" onClick={start} className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white">
          {t.party.start}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {videoId && <SongVideo videoRef={videoRef} title={song.title} />}
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{isHost ? t.party.youHost : format(t.party.host, { name: hostName })}</span>
        <span className="text-muted" data-testid="party-listening">
          🎧 {format(t.party.listening, { n: listening })}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-accent-soft px-4 py-8 text-center" data-testid="party-stage">
        <p className="text-3xl font-bold leading-snug" lang={song.language} dir={directionOf(song.language)}>
          <TappableText
            text={index >= 0 ? line.text : song.lines[0].text}
            highlight={index >= 0 ? wordIndexAt(line, playback.time) : -1}
            onWord={(key, word, i) => setSelection({ key, word, line: Math.max(index, 0), index: i })}
          />
        </p>
        {translation && index >= 0 && <p className="mt-2 text-muted">{translation}</p>}
        {next && <p className="mt-4 text-lg opacity-50">{next.text}</p>}
        {floating.map((f) => (
          <span key={f.id} className="party-float pointer-events-none absolute bottom-2 text-3xl" style={{ left: `${f.x}%` }} aria-hidden>
            {f.emoji}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3" dir="ltr">
        {isHost ? (
          <button
            type="button"
            onClick={hostToggle}
            aria-label={playback.playing ? t.player.pause : t.player.play}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-xl text-white"
          >
            {playback.playing ? "❚❚" : "▶"}
          </button>
        ) : (
          hostPlaying &&
          !playback.playing && (
            <button type="button" onClick={listenAlong} className="shrink-0 rounded-full bg-accent px-4 py-2 font-semibold text-white">
              🔊 {t.party.listenAlong}
            </button>
          )
        )}
        <input
          type="range"
          min={0}
          max={playback.duration}
          step={0.1}
          value={playback.time}
          disabled={!isHost}
          onChange={(e) => hostSeek(Number(e.target.value))}
          aria-label="Seek"
          className="min-w-0 flex-1 accent-[var(--accent)]"
        />
        <span className="shrink-0 text-sm tabular-nums text-muted">{formatTime(playback.time)}</span>
      </div>

      <div className="flex justify-between gap-1" role="group" aria-label={t.party.react}>
        {REACTIONS.map((emoji) => (
          <button key={emoji} type="button" onClick={() => react(emoji)} className="flex-1 rounded-xl border border-border bg-surface py-2 text-2xl">
            {emoji}
          </button>
        ))}
      </div>

      {isHost && (
        <button type="button" onClick={end} className="w-full py-2 text-sm text-muted underline">
          {t.party.end}
        </button>
      )}

      {selection && <WordCard song={song} selection={selection} meaningLang={meaning} onClose={() => setSelection(null)} onSelect={setSelection} />}
    </div>
  );
}
