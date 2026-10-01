"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Song } from "@/lib/song";
import { usePreferences } from "./Preferences";
import { useCatalogLoaded, useHydrated, useSong } from "./useSongs";

/** Resolves a song by id (bundled or on this device) and renders `children` with it. */
export function SongRoute({ songId, children }: { songId?: string; children: (song: Song) => ReactNode }) {
  const { t } = usePreferences();
  const song = useSong(songId);
  const hydrated = useHydrated();
  const catalogLoaded = useCatalogLoaded();

  if (song) return <>{children(song)}</>;
  if (!hydrated || !catalogLoaded) return null;
  return (
    <section className="pt-10 text-center">
      <p className="text-5xl" aria-hidden="true">
        🎵
      </p>
      <p className="mt-4 text-lg">{t.catalog.notFound}</p>
      <Link href="/" className="mt-6 inline-block rounded-xl border border-border px-5 py-3 font-medium">
        {t.nav.catalog}
      </Link>
    </section>
  );
}
