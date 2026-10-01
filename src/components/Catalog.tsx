"use client";

import Link from "next/link";
import { LANGUAGE_NAMES, format } from "@/lib/i18n";
import type { Song } from "@/lib/song";
import { usePreferences } from "./Preferences";
import { offlineSongsStore } from "@/lib/offline";
import { useStreak, useUnderstood } from "./useProgress";
import { useSongs } from "./useSongs";

function Understood({ song }: { song: Song }) {
  const { t } = usePreferences();
  const percent = useUnderstood(song);
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0">{format(t.more.understood, { n: percent })}</span>
    </div>
  );
}

export function Catalog() {
  const { t } = usePreferences();
  const streakDays = useStreak();
  const songs = useSongs();
  const offlineIds = new Set(offlineSongsStore.useValue().map((s) => s.id));

  return (
    <section className="pt-4">
      <p className="text-lg text-muted">{t.tagline}</p>
      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold">{t.catalog.songs}</h1>
        {streakDays > 0 && <span className="font-semibold">🔥 {format(t.more.streak, { n: streakDays })}</span>}
      </div>
      <ul className="mt-4 grid gap-3">
        {songs.map((song) => (
          <li key={song.id}>
            <Link
              href={`/player?song=${song.id}`}
              className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-accent"
            >
              <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-accent-soft text-3xl" aria-hidden="true">
                🌊
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold" dir="ltr">
                  {song.title}
                </p>
                <p className="truncate text-sm text-muted" dir="ltr">
                  {song.artist}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium">
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">{LANGUAGE_NAMES[song.language]}</span>
                  <span className="rounded-full border border-border px-2 py-0.5">
                    {song.level === "beginner" ? t.catalog.beginner : song.level === "intermediate" ? t.ai.medium : t.ai.hard}
                  </span>
                  {!song.audioUrl && !song.youtubeId && <span className="rounded-full border border-border px-2 py-0.5">{t.catalog.demo}</span>}
                  {offlineIds.has(song.id) && <span className="rounded-full border border-border px-2 py-0.5">⬇ {t.offline.badge}</span>}
                </div>
                <Understood song={song} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/studio"
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-4 font-medium text-muted hover:border-accent hover:text-accent"
      >
        ＋ {t.catalog.addSong}
      </Link>
      <Link href="/artists" className="mt-3 block text-center text-sm text-muted underline">
        🎤 {t.artists.forArtists}
      </Link>
    </section>
  );
}
