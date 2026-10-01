import type { Song } from "@shared/lib/song";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { createStore } from "./store";

// Songs saved for offline listening: the song itself is kept in storage, its
// audio file in the app's documents folder. YouTube songs can't be saved
// (YouTube doesn't allow offline copies).

export type OfflineSong = { song: Song; audioFile: string | null };
const isOffline = (v: unknown): v is OfflineSong[] => Array.isArray(v) && v.every((o) => typeof o === "object" && o !== null && "song" in o);
export const offlineSongsStore = createStore<OfflineSong[]>("verso.offline", [], isOffline);

export function canSaveOffline(song: Song): boolean {
  return !song.youtubeId && Platform.OS !== "web";
}

/** The local audio file for a saved song, else its web address. */
export function audioSourceFor(song: Song): string | undefined {
  const saved = offlineSongsStore.get().find((o) => o.song.id === song.id);
  if (saved?.audioFile && new File(saved.audioFile).exists) return saved.audioFile;
  return song.audioUrl;
}

export async function saveOffline(song: Song): Promise<boolean> {
  if (!canSaveOffline(song)) return false;
  try {
    let audioFile: string | null = null;
    if (song.audioUrl) {
      const folder = new Directory(Paths.document, "songs");
      folder.create({ idempotent: true, intermediates: true });
      const target = new File(folder, `${song.id}${extensionOf(song.audioUrl)}`);
      if (target.exists) target.delete();
      audioFile = (await File.downloadFileAsync(song.audioUrl, target)).uri;
    }
    offlineSongsStore.set([{ song, audioFile }, ...offlineSongsStore.get().filter((o) => o.song.id !== song.id)]);
    return true;
  } catch {
    return false;
  }
}

export function removeOffline(songId: string) {
  const saved = offlineSongsStore.get().find((o) => o.song.id === songId);
  if (saved?.audioFile) {
    try {
      const file = new File(saved.audioFile);
      if (file.exists) file.delete();
    } catch {
      // Already gone.
    }
  }
  offlineSongsStore.set(offlineSongsStore.get().filter((o) => o.song.id !== songId));
}

function extensionOf(url: string): string {
  const match = url.split("?")[0].match(/\.(mp3|m4a|aac|ogg|wav|webm|flac)$/i);
  return match ? `.${match[1].toLowerCase()}` : ".mp3";
}
