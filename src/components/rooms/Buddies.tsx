"use client";

import Link from "next/link";
import { useMemo } from "react";
import { LANGUAGE_NAMES, format } from "@/lib/i18n";
import type { Buddy, OwnProfile, RoomsBackend } from "@/lib/rooms/backend";
import { usePreferences } from "../Preferences";
import { ProfileGate } from "./ProfileGate";
import { errorText, useLive } from "./useRooms";

export function BuddiesScreen() {
  const { t } = usePreferences();
  return (
    <section className="space-y-4 pt-4">
      <Link href="/rooms" className="text-sm text-muted">
        ← {t.rooms.title}
      </Link>
      <h1 className="text-3xl font-bold">{t.buddies.title}</h1>
      <p className="text-muted">{t.buddies.intro}</p>
      <ProfileGate>{(rooms, me) => <BuddiesBody rooms={rooms} me={me} />}</ProfileGate>
    </section>
  );
}

function BuddiesBody({ rooms, me }: { rooms: RoomsBackend; me: OwnProfile }) {
  const { t } = usePreferences();
  const [found] = useLive(() => rooms.buddies(), null, [rooms]);
  const subscribe = (onChange: () => void) => rooms.subscribeDirect(onChange);
  const [conversations] = useLive(() => rooms.conversations(), subscribe, [rooms]);
  const others = useMemo(() => (conversations ?? []).map((c) => c.other).sort(), [conversations]);
  const [people] = useLive(() => rooms.profiles(others), null, [rooms, others.join(",")]);

  return (
    <div className="space-y-6">
      {conversations && conversations.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">{t.buddies.conversations}</h2>
          <ul className="space-y-2" aria-label={t.buddies.conversations}>
            {conversations.map(({ other, last }) => (
              <li key={other}>
                <Link href={`/buddies/${encodeURIComponent(other)}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 hover:border-accent">
                  <span className="text-2xl" aria-hidden>
                    {people?.[other]?.avatar ?? "🎧"}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{people?.[other]?.name ?? "…"}</span>
                    <span className="block truncate text-sm text-muted">
                      {last.from === me.id ? `${t.rooms.you}: ` : ""}
                      {last.body}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {found === undefined ? (
        <p className="text-muted">…</p>
      ) : !found.ok ? (
        <p className="text-muted">{errorText(t, found.error)}</p>
      ) : found.buddies.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-muted">{t.buddies.none}</p>
      ) : (
        <ul className="space-y-3" aria-label={t.buddies.title}>
          {found.buddies.map((buddy) => (
            <BuddyRow key={buddy.id} buddy={buddy} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BuddyRow({ buddy }: { buddy: Buddy }) {
  const { t } = usePreferences();
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <span className="text-3xl" aria-hidden>
        {buddy.avatar}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {buddy.name}
          {buddy.mutual && <span className="ms-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{t.buddies.perfect}</span>}
        </p>
        {buddy.speaks && <p className="text-sm text-muted">{format(t.buddies.speaks, { lang: LANGUAGE_NAMES[buddy.speaks] })}</p>}
        {buddy.learning.length > 0 && (
          <p className="text-sm text-muted">{format(t.buddies.learning, { langs: buddy.learning.map((l) => LANGUAGE_NAMES[l]).join(", ") })}</p>
        )}
      </div>
      <Link href={`/buddies/${encodeURIComponent(buddy.id)}`} className="shrink-0 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white">
        {t.buddies.message}
      </Link>
    </li>
  );
}
