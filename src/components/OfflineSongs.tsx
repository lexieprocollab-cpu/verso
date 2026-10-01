"use client";

import Link from "next/link";
import { offlineSongsStore, removeOffline } from "@/lib/offline";
import { usePreferences } from "./Preferences";

/** Settings: songs saved on this device for offline listening. */
export function OfflineSongs() {
  const { t } = usePreferences();
  const songs = offlineSongsStore.useValue();
  return (
    <div>
      <p className="mb-2 font-medium">{t.offline.title}</p>
      <div className="rounded-xl border border-border bg-surface p-4">
        {songs.length === 0 ? (
          <p className="text-sm text-muted">{t.offline.none}</p>
        ) : (
          <ul className="space-y-2" aria-label={t.offline.title}>
            {songs.map((song) => (
              <li key={song.id} className="flex items-center justify-between gap-3">
                <Link href={`/player?song=${encodeURIComponent(song.id)}`} className="min-w-0 truncate font-medium">
                  {song.title}
                </Link>
                <button type="button" onClick={() => void removeOffline(song)} className="shrink-0 text-sm text-muted underline">
                  {t.offline.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
