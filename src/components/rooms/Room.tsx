"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { callAi } from "@/lib/ai/client";
import { LANGUAGE_NAMES, format } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";
import { utcDay, type OwnProfile, type RoomMessage, type RoomProfile, type RoomsBackend } from "@/lib/rooms/backend";
import { challengeIndex, challengeWinner, checkMessage, outsideWords, songVocabulary, type RoomMode, type Vote } from "@/lib/rooms/rules";
import { tokenize, type Song } from "@/lib/song";
import { usePreferences } from "../Preferences";
import { useMeaningLang } from "../useMeaningLang";
import { useCatalogLoaded, useHydrated, useSong, useSongs } from "../useSongs";
import { Party } from "./Party";
import { ProfileGate } from "./ProfileGate";
import { errorText, mutedStore, useLive, useRoomsBackend } from "./useRooms";

const PROMPTS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"] as const;

export function RoomScreen({ songId }: { songId: string }) {
  const { t } = usePreferences();
  const hydrated = useHydrated();
  const song = useSong(songId);
  const rooms = useRoomsBackend();
  const catalogLoaded = useCatalogLoaded();

  if (!hydrated || !rooms || (!song && !catalogLoaded)) return <p className="pt-8 text-muted">…</p>;
  if (!song) return <p className="pt-8 text-muted">{t.catalog.notFound}</p>;

  return (
    <section className="space-y-4">
      <header className="space-y-1 pt-4">
        <Link href="/rooms" className="text-sm text-muted">
          ← {t.rooms.title}
        </Link>
        <h1 className="text-2xl font-bold">{song.title}</h1>
        <p className="text-sm text-muted">
          {song.artist} ·{" "}
          <Link href={`/player?song=${encodeURIComponent(song.id)}`} className="underline">
            {t.nav.player}
          </Link>
        </p>
        {rooms.kind === "device" && <p className="rounded-xl bg-accent-soft px-4 py-2 text-sm">{t.rooms.deviceMode}</p>}
      </header>
      <ProfileGate>{(backend, me) => <RoomBody rooms={backend} song={song} me={me} />}</ProfileGate>
    </section>
  );
}

function RoomBody({ rooms, song, me }: { rooms: RoomsBackend; song: Song; me: OwnProfile }) {
  const { t } = usePreferences();
  const [tab, setTab] = useState<"chat" | "challenge" | "party">("chat");
  const subscribe = (onChange: () => void) => rooms.subscribe(song.id, onChange);
  const [messages] = useLive(() => rooms.messages(song.id), subscribe, [rooms, song.id]);
  const [votes] = useLive(() => rooms.votes(song.id), subscribe, [rooms, song.id]);
  const [blocked, reloadBlocked] = useLive(() => rooms.blocked(), null, [rooms]);
  const [following, reloadFollowing] = useLive(() => rooms.following(), null, [rooms]);
  const [counts] = useLive(() => rooms.memberCounts(), subscribe, [rooms, song.id]);
  const muted = mutedStore.useValue();
  const authorIds = useMemo(() => [...new Set((messages ?? []).map((m) => m.userId))].sort(), [messages]);
  const [profiles] = useLive(() => rooms.profiles(authorIds), null, [rooms, authorIds.join(",")]);
  const [openProfile, setOpenProfile] = useState<string | null>(null);

  const visible = (messages ?? []).filter((m) => !muted.includes(m.userId) && !(blocked ?? []).includes(m.userId));
  const people = { ...profiles, [me.id]: me };

  const tabClass = (on: boolean) => `flex-1 rounded-xl px-3 py-2 font-medium ${on ? "bg-accent text-white" : "bg-surface"}`;

  return (
    <>
      <p className="text-sm text-muted">{format(t.rooms.members, { n: counts?.[song.id] ?? 0 })}</p>
      <div className="flex gap-2" role="tablist">
        <button role="tab" aria-selected={tab === "chat"} className={tabClass(tab === "chat")} onClick={() => setTab("chat")}>
          {t.rooms.chat}
        </button>
        <button role="tab" aria-selected={tab === "challenge"} className={tabClass(tab === "challenge")} onClick={() => setTab("challenge")}>
          {t.rooms.challenge}
        </button>
        <button role="tab" aria-selected={tab === "party"} className={tabClass(tab === "party")} onClick={() => setTab("party")}>
          {t.party.tab}
        </button>
      </div>

      {/* Stays mounted so the party keeps playing while you chat. */}
      <div hidden={tab !== "party"}>
        <Party rooms={rooms} song={song} me={me} />
      </div>
      {tab === "party" ? null : tab === "chat" ? (
        <Chat rooms={rooms} song={song} me={me} messages={visible.filter((m) => !m.challengeDay)} people={people} onAuthor={setOpenProfile} />
      ) : (
        <Challenge rooms={rooms} song={song} me={me} entries={visible.filter((m) => m.challengeDay)} votes={votes ?? []} people={people} onAuthor={setOpenProfile} />
      )}

      {openProfile && (
        <ProfileSheet
          profile={people[openProfile]}
          userId={openProfile}
          isMe={openProfile === me.id}
          following={(following ?? []).includes(openProfile)}
          blocked={(blocked ?? []).includes(openProfile)}
          muted={muted.includes(openProfile)}
          onFollow={async (on) => {
            await rooms.setFollowing(openProfile, on);
            reloadFollowing();
          }}
          onBlock={async (on) => {
            await rooms.setBlocked(openProfile, on);
            reloadBlocked();
          }}
          onMute={(on) => mutedStore.set(on ? [...muted, openProfile] : muted.filter((id) => id !== openProfile))}
          onClose={() => setOpenProfile(null)}
        />
      )}
    </>
  );
}

function Author({ profile, isMe, onClick, t }: { profile?: RoomProfile; isMe: boolean; onClick: () => void; t: Dictionary }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 text-sm font-semibold">
      <span className="text-lg" aria-hidden>
        {profile?.avatar ?? "🎧"}
      </span>
      {isMe ? t.rooms.you : profile?.name || "…"}
    </button>
  );
}

function Chat({
  rooms,
  song,
  me,
  messages,
  people,
  onAuthor,
}: {
  rooms: RoomsBackend;
  song: Song;
  me: OwnProfile;
  messages: RoomMessage[];
  people: Record<string, RoomProfile>;
  onAuthor: (id: string) => void;
}) {
  const { t } = usePreferences();
  const meaning = useMeaningLang(song.language);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function translate(message: RoomMessage) {
    if (!meaning) return;
    setTranslations((all) => ({ ...all, [message.id]: t.ai.loading }));
    const outcome = await callAi("translate", { lines: [message.body], learn: song.language, target: meaning });
    const text = outcome.ok ? outcome.data.translations[0] ?? "" : outcome.reason === "not_configured" ? t.ai.unavailable : t.ai.failed;
    setTranslations((all) => ({ ...all, [message.id]: text }));
  }

  async function report(message: RoomMessage) {
    const outcome = await rooms.report(message.id);
    setNotice(outcome.ok ? t.rooms.reported : errorText(t, outcome.error));
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p role="status" className="rounded-xl bg-accent-soft px-4 py-2 text-sm">
          {notice}
        </p>
      )}
      {messages.length === 0 ? (
        <p className="py-6 text-center text-muted">{t.rooms.empty}</p>
      ) : (
        <ol className="space-y-3" aria-label={t.rooms.chat}>
          {messages.map((m) => (
            <li key={m.id} className="rounded-2xl border border-border bg-surface p-3" data-message={m.id}>
              <div className="flex items-center justify-between gap-2">
                <Author profile={people[m.userId]} isMe={m.userId === me.id} onClick={() => onAuthor(m.userId)} t={t} />
                <time className="text-xs text-muted">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
              <p className="mt-1 text-lg" lang={song.language}>
                {m.body}
              </p>
              {translations[m.id] && <p className="text-sm text-muted">{translations[m.id]}</p>}
              <div className="mt-2 flex gap-3 text-sm text-muted">
                {meaning && (
                  <button type="button" onClick={() => void translate(m)} className="hover:text-text">
                    {t.rooms.translate}
                  </button>
                )}
                {m.userId !== me.id && (
                  <button type="button" onClick={() => void report(m)} className="hover:text-text">
                    {t.rooms.report}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <Composer rooms={rooms} song={song} challenge={false} />
    </div>
  );
}

function Composer({ rooms, song, challenge }: { rooms: RoomsBackend; song: Song; challenge: boolean }) {
  const { t } = usePreferences();
  const vocabulary = useMemo(() => songVocabulary(song), [song]);
  const wordBank = useMemo(() => [...vocabulary].sort((a, b) => a.localeCompare(b, song.language)), [vocabulary, song.language]);
  const [chosenMode, setMode] = useState<RoomMode>("song");
  const mode: RoomMode = challenge ? "song" : chosenMode;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const problem = checkMessage(text, mode, vocabulary);
  const outside = mode === "song" ? outsideWords(text, vocabulary) : [];

  async function send() {
    if (problem || sending) return;
    setSending(true);
    const outcome = await rooms.send(song, text, mode, challenge);
    setSending(false);
    if (outcome.ok) {
      setText("");
      setError(null);
    } else setError(errorText(t, outcome.error, outside));
  }

  const modeClass = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft text-accent" : "border-border"}`;

  return (
    <form
      className="space-y-3 rounded-2xl border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {!challenge && (
        <div className="flex gap-2">
          <button type="button" aria-pressed={mode === "song"} className={modeClass(mode === "song")} onClick={() => setMode("song")}>
            {t.rooms.modeSong}
          </button>
          <button type="button" aria-pressed={mode === "free"} className={modeClass(mode === "free")} onClick={() => setMode("free")}>
            {t.rooms.modeFree}
          </button>
        </div>
      )}
      {mode === "song" && (
        <>
          <p className="text-sm text-muted">{t.rooms.modeSongHint}</p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto" aria-label="word bank" lang={song.language}>
            {wordBank.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => setText((current) => `${current.trimEnd()} ${word}`.trimStart())}
                className="rounded-lg border border-border bg-bg px-2 py-0.5 text-sm"
              >
                {word}
              </button>
            ))}
          </div>
        </>
      )}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.rooms.placeholder}
        aria-label={t.rooms.placeholder}
        lang={song.language}
        className="w-full rounded-xl border border-border bg-bg px-4 py-3"
      />
      {outside.length > 0 && (
        <p className="text-sm" aria-live="polite">
          {tokenize(text).map((token, i) =>
            token.isWord && outside.includes(token.key) ? (
              <span key={i} className="text-red-600 underline decoration-red-600 decoration-wavy">
                {token.text}
              </span>
            ) : (
              <span key={i}>{token.text}</span>
            ),
          )}
          <span className="block text-red-600">{errorText(t, "outside_words", outside)}</span>
        </p>
      )}
      {problem && problem !== "empty" && problem !== "outside_words" && <p className="text-sm text-red-600">{errorText(t, problem)}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={Boolean(problem) || sending} className="w-full rounded-xl bg-accent px-4 py-2.5 font-semibold text-white disabled:opacity-50">
        {challenge ? t.rooms.submitEntry : t.rooms.send}
      </button>
    </form>
  );
}

function Challenge({
  rooms,
  song,
  me,
  entries,
  votes,
  people,
  onAuthor,
}: {
  rooms: RoomsBackend;
  song: Song;
  me: OwnProfile;
  entries: RoomMessage[];
  votes: Vote[];
  people: Record<string, RoomProfile>;
  onAuthor: (id: string) => void;
}) {
  const { t } = usePreferences();
  const [today] = useState(() => utcDay());
  const [yesterday] = useState(() => utcDay(-1));
  const [error, setError] = useState<string | null>(null);
  const words = useMemo(() => [...songVocabulary(song)].sort(), [song]);
  const prompt = PROMPTS[challengeIndex(song.id, today, PROMPTS.length)];
  const word = words[challengeIndex(song.id, `${today}:word`, words.length)] ?? "";
  const todays = entries.filter((e) => e.challengeDay === today);
  const winner = challengeWinner(
    entries.filter((e) => e.challengeDay === yesterday),
    votes,
  );
  const count = (id: string) => votes.filter((v) => v.messageId === id).length;

  async function vote(id: string) {
    const outcome = await rooms.vote(id);
    setError(outcome.ok ? null : errorText(t, outcome.error));
  }

  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-accent-soft p-4 text-lg font-semibold" data-testid="challenge-prompt">
        {format(t.rooms[prompt], { word })}
      </p>
      {winner && (
        <div className="rounded-2xl border border-accent p-3">
          <p className="text-sm font-semibold text-accent">🏆 {t.rooms.winner}</p>
          <Author profile={people[winner.userId]} isMe={winner.userId === me.id} onClick={() => onAuthor(winner.userId)} t={t} />
          <p className="text-lg">{winner.body}</p>
        </div>
      )}
      <Composer rooms={rooms} song={song} challenge />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <h2 className="font-semibold">{t.rooms.entries}</h2>
      {todays.length === 0 ? (
        <p className="text-muted">{t.rooms.noEntries}</p>
      ) : (
        <ol className="space-y-3" aria-label={t.rooms.entries}>
          {[...todays]
            .sort((a, b) => count(b.id) - count(a.id) || a.createdAt - b.createdAt)
            .map((entry) => {
              const voted = votes.some((v) => v.messageId === entry.id && v.voterId === me.id);
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3">
                  <div>
                    <Author profile={people[entry.userId]} isMe={entry.userId === me.id} onClick={() => onAuthor(entry.userId)} t={t} />
                    <p className="text-lg" lang={song.language}>
                      {entry.body}
                    </p>
                    <p className="text-sm text-muted">{format(t.rooms.votes, { n: count(entry.id) })}</p>
                  </div>
                  {entry.userId !== me.id && (
                    <button
                      type="button"
                      disabled={voted}
                      onClick={() => void vote(entry.id)}
                      className="shrink-0 rounded-xl border border-accent px-3 py-1.5 text-accent disabled:opacity-60"
                    >
                      {voted ? t.rooms.voted : t.rooms.vote}
                    </button>
                  )}
                </li>
              );
            })}
        </ol>
      )}
    </div>
  );
}

function ProfileSheet(props: {
  profile?: RoomProfile;
  userId: string;
  isMe: boolean;
  following: boolean;
  blocked: boolean;
  muted: boolean;
  onFollow: (on: boolean) => void;
  onBlock: (on: boolean) => void;
  onMute: (on: boolean) => void;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const songs = useSongs();
  const { profile } = props;
  const button = "flex-1 rounded-xl border border-border px-3 py-2 font-medium";

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40" onClick={props.onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={profile?.name}
        className="w-full max-w-2xl space-y-3 rounded-t-3xl bg-bg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>
            {profile?.avatar ?? "🎧"}
          </span>
          <div>
            <p className="text-xl font-bold">{props.isMe ? `${profile?.name ?? ""} (${t.rooms.you})` : profile?.name}</p>
            {profile?.speaks && (
              <p className="text-sm text-muted">
                {t.rooms.speaks}: {LANGUAGE_NAMES[profile.speaks]}
              </p>
            )}
          </div>
        </div>
        {profile && profile.learning.length > 0 && (
          <p className="text-sm">
            {t.rooms.learning}: {profile.learning.map((l) => LANGUAGE_NAMES[l]).join(", ")}
          </p>
        )}
        {profile && profile.favorites.length > 0 && (
          <p className="text-sm">
            {t.rooms.favorites}: {profile.favorites.map((id) => songs.find((s) => s.id === id)?.title ?? id).join(", ")}
          </p>
        )}
        {!props.isMe && (
          <Link href={`/buddies/${encodeURIComponent(props.userId)}`} className="block w-full rounded-xl bg-accent px-3 py-2 text-center font-semibold text-white">
            {t.buddies.message}
          </Link>
        )}
        {!props.isMe && (
          <div className="flex gap-2">
            <button type="button" className={`${button} ${props.following ? "bg-accent-soft text-accent" : ""}`} onClick={() => props.onFollow(!props.following)}>
              {props.following ? t.rooms.following : t.rooms.follow}
            </button>
            <button type="button" className={button} onClick={() => props.onMute(!props.muted)}>
              {props.muted ? t.rooms.unmute : t.rooms.mute}
            </button>
            <button type="button" className={`${button} text-red-600`} onClick={() => props.onBlock(!props.blocked)}>
              {props.blocked ? t.rooms.unblock : t.rooms.block}
            </button>
          </div>
        )}
        <button type="button" className="w-full py-2 text-muted" onClick={props.onClose}>
          {t.word.close}
        </button>
      </div>
    </div>
  );
}
