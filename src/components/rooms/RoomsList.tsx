"use client";

import Link from "next/link";
import { format } from "@/lib/i18n";
import { usePreferences } from "../Preferences";
import { useSongs } from "../useSongs";
import { useLive, useRoomsBackend } from "./useRooms";

export function RoomsList() {
  const { t } = usePreferences();
  const songs = useSongs();
  const rooms = useRoomsBackend();
  const [counts] = useLive(rooms ? () => rooms.memberCounts() : null, null, [rooms]);

  return (
    <section className="space-y-4 pt-4">
      <h1 className="text-3xl font-bold">{t.rooms.title}</h1>
      <p className="text-muted">{t.rooms.intro}</p>
      {rooms?.kind === "device" && <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">{t.rooms.deviceMode}</p>}
      <Link href="/buddies" className="flex items-center gap-3 rounded-2xl bg-accent-soft p-4 font-semibold text-accent">
        <span className="text-2xl" aria-hidden>
          🤝
        </span>
        {t.buddies.find} →
      </Link>
      <ul className="space-y-3">
        {songs.map((song) => (
          <li key={song.id}>
            <Link
              href={`/rooms/${encodeURIComponent(song.id)}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-accent"
            >
              <span>
                <span className="block font-semibold">{song.title}</span>
                <span className="block text-sm text-muted">
                  {song.artist} · {format(t.rooms.members, { n: counts?.[song.id] ?? 0 })}
                </span>
              </span>
              <span className="shrink-0 text-accent">{t.rooms.enter} →</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/moderate" className="inline-block text-sm text-muted underline">
        {t.rooms.moderation}
      </Link>
    </section>
  );
}
