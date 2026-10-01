"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { callAi } from "@/lib/ai/client";
import { LANGUAGE_NAMES, format } from "@/lib/i18n";
import type { DirectMessage, OwnProfile, RoomsBackend } from "@/lib/rooms/backend";
import { checkMessage } from "@/lib/rooms/rules";
import { usePreferences } from "../Preferences";
import { ProfileGate } from "./ProfileGate";
import { errorText, useLive } from "./useRooms";

export function DirectChatScreen({ otherId }: { otherId: string }) {
  const { t } = usePreferences();
  return (
    <section className="space-y-4 pt-4">
      <Link href="/buddies" className="text-sm text-muted">
        ← {t.buddies.title}
      </Link>
      <ProfileGate>{(rooms, me) => <DirectChat rooms={rooms} me={me} otherId={otherId} />}</ProfileGate>
    </section>
  );
}

function DirectChat({ rooms, me, otherId }: { rooms: RoomsBackend; me: OwnProfile; otherId: string }) {
  const { t, lang } = usePreferences();
  const subscribe = (onChange: () => void) => rooms.subscribeDirect(onChange);
  const [messages] = useLive(() => rooms.directMessages(otherId), subscribe, [rooms, otherId]);
  const [people] = useLive(() => rooms.profiles([otherId]), null, [rooms, otherId]);
  const [following, reloadFollowing] = useLive(() => rooms.following(), null, [rooms]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const end = useRef<HTMLDivElement>(null);
  const other = people?.[otherId];
  const isFollowing = (following ?? []).includes(otherId);
  const problem = checkMessage(text, "free", new Set());

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function send() {
    if (problem) return;
    const outcome = await rooms.sendDirect(otherId, text);
    if (outcome.ok) {
      setText("");
      setError(null);
    } else setError(errorText(t, outcome.error));
  }

  async function translate(message: DirectMessage) {
    const from = message.from === me.id ? (me.learning[0] ?? lang) : (other?.speaks ?? lang);
    if (from === lang) return;
    setTranslations((all) => ({ ...all, [message.id]: t.ai.loading }));
    const outcome = await callAi("translate", { lines: [message.body], learn: from, target: lang });
    setTranslations((all) => ({
      ...all,
      [message.id]: outcome.ok ? (outcome.data.translations[0] ?? "") : outcome.reason === "not_configured" ? t.ai.unavailable : t.ai.failed,
    }));
  }

  async function report(message: DirectMessage) {
    const outcome = await rooms.reportDirect(message.id);
    setNotice(outcome.ok ? t.rooms.reported : errorText(t, outcome.error));
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden>
          {other?.avatar ?? "🎧"}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{other?.name ?? "…"}</h1>
          {other?.speaks && <p className="text-sm text-muted">{format(t.buddies.speaks, { lang: LANGUAGE_NAMES[other.speaks] })}</p>}
        </div>
        <button
          type="button"
          onClick={async () => {
            await rooms.setFollowing(otherId, !isFollowing);
            reloadFollowing();
          }}
          className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-medium ${isFollowing ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
        >
          {isFollowing ? t.rooms.following : t.rooms.follow}
        </button>
      </header>

      {notice && (
        <p role="status" className="rounded-xl bg-accent-soft px-4 py-2 text-sm">
          {notice}
        </p>
      )}

      {messages && messages.length === 0 && <p className="py-6 text-center text-muted">{t.buddies.sayHello}</p>}
      <ol className="space-y-2" aria-label={t.buddies.conversations}>
        {(messages ?? []).map((m) => {
          const mine = m.from === me.id;
          return (
            <li key={m.id} className={`max-w-[85%] rounded-2xl p-3 ${mine ? "ms-auto rounded-se-sm bg-accent-soft" : "rounded-ss-sm bg-surface"}`}>
              <p className="text-lg">{m.body}</p>
              {translations[m.id] && <p className="text-sm text-muted">{translations[m.id]}</p>}
              <div className="mt-1 flex gap-3 text-sm text-muted">
                <button type="button" onClick={() => void translate(m)}>
                  {t.rooms.translate}
                </button>
                {!mine && (
                  <button type="button" onClick={() => void report(m)}>
                    {t.rooms.report}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={end} />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder={t.rooms.placeholder}
          aria-label={t.rooms.placeholder}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3"
        />
        <button type="submit" disabled={Boolean(problem)} className="rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50">
          {t.rooms.send}
        </button>
      </form>
      {problem && problem !== "empty" && <p className="text-sm text-red-600">{errorText(t, problem)}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
