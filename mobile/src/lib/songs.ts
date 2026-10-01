import { songs as bundledSongs } from "@shared/content/songs";
import { fetchPublishedSongs } from "@shared/lib/catalog";
import type { Song } from "@shared/lib/song";
import { useMemo, useSyncExternalStore } from "react";
import { offlineSongsStore } from "./offline";
import { getSupabase } from "./supabase";

// Songs: published ones from the database (when connected), songs saved
// offline, and the bundled demo.

const NONE: Song[] = [];
let cloud: Song[] = NONE;
let loaded = false;
let requested = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!requested) {
    requested = true;
    const done = (songs: Song[]) => {
      cloud = songs;
      loaded = true;
      listeners.forEach((l) => l());
    };
    const db = getSupabase();
    if (db) fetchPublishedSongs(db).then(done, () => done(NONE));
    else done(NONE);
  }
  return () => void listeners.delete(listener);
}

export function useCatalogLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded, () => false);
}

export function useSongs(): Song[] {
  const fromCloud = useSyncExternalStore(subscribe, () => cloud, () => NONE);
  const offline = offlineSongsStore.useValue();
  return useMemo(() => {
    const seen = new Set<string>();
    return [...fromCloud, ...offline.map((o) => o.song), ...bundledSongs].filter((song) => !seen.has(song.id) && seen.add(song.id));
  }, [fromCloud, offline]);
}

export function useSong(id: string | undefined): Song | undefined {
  const all = useSongs();
  return all.find((song) => song.id === id);
}
