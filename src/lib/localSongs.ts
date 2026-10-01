import { isUiLanguage } from "./i18n";
import { createLocalStore, parseJson } from "./localStore";
import type { Song } from "./song";

// Songs made in the timing tool and added to "my catalog" on this device.
// They move to the database with step 6; audio must be a web URL (a file
// picked from the device can't be stored here).

function isSong(value: unknown): value is Song {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.title === "string" &&
    typeof s.artist === "string" &&
    isUiLanguage(s.language) &&
    typeof s.duration === "number" &&
    Array.isArray(s.lines) &&
    s.lines.every(
      (l) => typeof l === "object" && l !== null && typeof l.text === "string" && typeof l.start === "number" && typeof l.end === "number",
    )
  );
}

function isSongList(value: unknown): value is Song[] {
  return Array.isArray(value) && value.every(isSong);
}

export const localSongsStore = createLocalStore<Song[]>("verso.songs", [], (raw) => parseJson(raw, [], isSongList));

export function saveLocalSong(song: Song) {
  const persisted: Song = {
    ...song,
    audioUrl: song.audioUrl && /^https?:\/\//.test(song.audioUrl) ? song.audioUrl : undefined,
  };
  localSongsStore.set([persisted, ...localSongsStore.get().filter((s) => s.id !== song.id)]);
}

export function removeLocalSong(id: string) {
  localSongsStore.set(localSongsStore.get().filter((s) => s.id !== id));
}
