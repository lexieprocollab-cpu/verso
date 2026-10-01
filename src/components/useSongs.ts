"use client";

import { useMemo, useSyncExternalStore } from "react";
import { songs as bundledSongs } from "@/content/songs";
import { fetchPublishedSongs } from "@/lib/catalog";
import { localSongsStore } from "@/lib/localSongs";
import { offlineSongsStore } from "@/lib/offline";
import type { Song } from "@/lib/song";
import { getSupabase } from "@/lib/supabase";

// Published songs from the database, fetched once per visit when Supabase is set up.
const NO_SONGS: Song[] = [];
let cloudSongs: Song[] = NO_SONGS;
let cloudLoaded = false;
let cloudRequested = false;
const cloudListeners = new Set<() => void>();

function subscribeCloud(notify: () => void) {
  cloudListeners.add(notify);
  if (!cloudRequested) {
    cloudRequested = true;
    const db = getSupabase();
    const done = (songs: Song[]) => {
      cloudSongs = songs;
      cloudLoaded = true;
      cloudListeners.forEach((listener) => listener());
    };
    if (db) fetchPublishedSongs(db).then(done, () => done(NO_SONGS));
    else done(NO_SONGS);
  }
  return () => void cloudListeners.delete(notify);
}

/** False until the database catalog has loaded (or there is none), so screens don't flash "not found". */
export function useCatalogLoaded(): boolean {
  return useSyncExternalStore(
    subscribeCloud,
    () => cloudLoaded,
    () => false,
  );
}

/** Songs made on this device, then published songs from the database, then the bundled ones. Offline copies fill in when the database can't be reached. */
export function useSongs(): Song[] {
  const local = localSongsStore.useValue();
  const offline = offlineSongsStore.useValue();
  const cloud = useSyncExternalStore(
    subscribeCloud,
    () => cloudSongs,
    () => NO_SONGS,
  );
  return useMemo(() => {
    const seen = new Set<string>();
    return [...local, ...cloud, ...offline, ...bundledSongs].filter((song) => !seen.has(song.id) && seen.add(song.id));
  }, [local, cloud, offline]);
}

export function useSong(id: string | undefined): Song | undefined {
  const songs = useSongs();
  return id ? songs.find((s) => s.id === id) : songs.find((s) => s.id === bundledSongs[0].id);
}

const noop = () => () => {};

/** False during server render and hydration, true after — to avoid flashing "not found" for device songs. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
