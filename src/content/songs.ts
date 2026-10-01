import type { Song } from "@/lib/song";
import { demoSong } from "./demoSong";

// Until the catalog lives in the database (step 6), songs ship with the app.
export const songs: Song[] = [demoSong];

export function getSong(id: string): Song | undefined {
  return songs.find((song) => song.id === id);
}
