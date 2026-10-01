import { isUiLanguage } from "./i18n";
import { createLocalStore, parseJson } from "./localStore";
import type { Song } from "./song";

// Songs saved for offline use (step 30). The song itself (lyrics, timings,
// translations) is kept here; its audio goes into the service worker's
// "verso-audio" cache; the pages are cached by the service worker as they load.

const AUDIO_CACHE = "verso-audio";

const isSongList = (value: unknown): value is Song[] =>
  Array.isArray(value) && value.every((s) => typeof s === "object" && s !== null && typeof s.id === "string" && isUiLanguage(s.language) && Array.isArray(s.lines));

export const offlineSongsStore = createLocalStore<Song[]>("verso.offline", [], (raw) => parseJson(raw, [], isSongList));

export type OfflineProblem = "video" | "unsupported" | "failed";

/** Songs that play from YouTube can't be saved: YouTube doesn't allow offline copies. */
export function canSaveOffline(song: Song): boolean {
  return !song.youtubeId;
}

export async function saveOffline(song: Song): Promise<{ ok: true } | { ok: false; problem: OfflineProblem }> {
  if (!canSaveOffline(song)) return { ok: false, problem: "video" };
  if (typeof caches === "undefined" || !("serviceWorker" in navigator)) return { ok: false, problem: "unsupported" };
  try {
    if (song.audioUrl) {
      const cache = await caches.open(AUDIO_CACHE);
      if (!(await cache.match(song.audioUrl))) await cache.add(new Request(song.audioUrl, { mode: "cors" }));
    }
    // Load the song's pages once so the service worker keeps a copy.
    const pages = [`/player?song=${encodeURIComponent(song.id)}`, `/practice/quiz?song=${encodeURIComponent(song.id)}`, "/", "/words", "/practice"];
    await Promise.all(pages.map((page) => fetch(page, { headers: { accept: "text/html" } })));
    offlineSongsStore.set([song, ...offlineSongsStore.get().filter((s) => s.id !== song.id)]);
    return { ok: true };
  } catch {
    return { ok: false, problem: "failed" };
  }
}

export async function removeOffline(song: Song) {
  offlineSongsStore.set(offlineSongsStore.get().filter((s) => s.id !== song.id));
  if (song.audioUrl && typeof caches !== "undefined") await (await caches.open(AUDIO_CACHE)).delete(song.audioUrl);
}

/** Registers the service worker (production builds only, so development stays uncached). */
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
