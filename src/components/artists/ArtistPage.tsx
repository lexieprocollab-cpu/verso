"use client";

import Link from "next/link";
import { LANGUAGE_NAMES } from "@/lib/i18n";
import { usePreferences } from "../Preferences";
import { useLive } from "../rooms/useRooms";
import { useCatalogLoaded, useSongs } from "../useSongs";
import { useArtists } from "./useArtists";

/** Public artist page: who they are, their links and their published songs. */
export function ArtistPage({ slug }: { slug: string }) {
  const { t } = usePreferences();
  const artists = useArtists();
  const [artist] = useLive(artists ? () => artists.bySlug(slug) : null, null, [artists, slug]);
  const songs = useSongs().filter((song) => song.artistSlug === slug);
  const loaded = useCatalogLoaded();

  if (artist === undefined || !loaded) return <p className="pt-8 text-muted">…</p>;
  if (!artist) return <p className="pt-8 text-center text-lg">{t.artists.notFound}</p>;

  return (
    <section className="space-y-5 pt-4">
      <div className="rounded-3xl bg-accent-soft p-6">
        <p className="text-3xl" aria-hidden>
          🎤
        </p>
        <h1 className="text-4xl font-bold">{artist.name}</h1>
        {artist.bio && <p className="mt-2 whitespace-pre-line">{artist.bio}</p>}
        {artist.links.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-3 text-sm" dir="ltr">
            {artist.links.map((link) => (
              <li key={link}>
                <a href={link} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline">
                  {new URL(link).host.replace(/^www\./, "")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <h2 className="text-xl font-semibold">{t.catalog.songs}</h2>
      {songs.length === 0 ? (
        <p className="text-muted">{t.artists.noSongs}</p>
      ) : (
        <ul className="space-y-3">
          {songs.map((song) => (
            <li key={song.id}>
              <Link href={`/player?song=${encodeURIComponent(song.id)}`} className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 hover:border-accent">
                <span>
                  <span className="block font-semibold">{song.title}</span>
                  <span className="block text-sm text-muted">{LANGUAGE_NAMES[song.language]}</span>
                </span>
                <span aria-hidden>▶</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
