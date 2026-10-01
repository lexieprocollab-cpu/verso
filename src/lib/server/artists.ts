import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIO_EXTENSIONS, MAX_AUDIO_BYTES, type ArtistProfile, type SongSubmission } from "../artists";
import { SPEECH_LANG, lineWords, slugify, wordKey } from "../song";

// Server side of artist uploads (step 28).

export type ArtistError = "artist_needed" | "slug_taken" | "bad_audio" | "too_many_pending" | "not_allowed";
export type ArtistResult<T = null> = { ok: true; data: T } | { ok: false; error: ArtistError };

const fail = (error: ArtistError): { ok: false; error: ArtistError } => ({ ok: false, error });

/** An artist may have this many songs waiting for review at once. */
export const MAX_PENDING = 5;

export async function saveArtist(db: SupabaseClient, userId: string, profile: ArtistProfile): Promise<ArtistResult> {
  const { data: owner } = await db.from("artists").select("id").eq("slug", profile.slug).maybeSingle();
  if (owner && owner.id !== userId) return fail("slug_taken");
  await db.from("artists").upsert({ id: userId, ...profile }, { onConflict: "id" });
  return { ok: true, data: null };
}

async function artistOf(db: SupabaseClient, userId: string) {
  const { data } = await db.from("artists").select("id, name, slug").eq("id", userId).maybeSingle();
  return data as { id: string; name: string; slug: string } | null;
}

/** A one-time URL the browser uploads the audio file to, straight into storage. */
export async function createAudioUpload(
  db: SupabaseClient,
  userId: string,
  file: { contentType: string; size: number },
): Promise<ArtistResult<{ path: string; signedUrl: string; token: string }>> {
  if (!(await artistOf(db, userId))) return fail("artist_needed");
  const extension = AUDIO_EXTENSIONS[file.contentType];
  if (!extension || file.size <= 0 || file.size > MAX_AUDIO_BYTES) return fail("bad_audio");
  const path = `${userId}/${randomUUID()}.${extension}`;
  const { data, error } = await db.storage.from("audio").createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "could not create upload URL");
  return { ok: true, data: { path, signedUrl: data.signedUrl, token: data.token } };
}

async function freeSongId(db: SupabaseClient, base: string): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    const { data } = await db.from("songs").select("id").eq("id", id).maybeSingle();
    if (!data) return id;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

/** Stores a submitted song, unpublished, for a moderator to review. */
export async function submitSong(db: SupabaseClient, userId: string, song: SongSubmission): Promise<ArtistResult<{ id: string }>> {
  const artist = await artistOf(db, userId);
  if (!artist) return fail("artist_needed");
  if (!song.audioPath.startsWith(`${userId}/`)) return fail("not_allowed");
  const { data: pending } = await db.from("songs").select("id").eq("artist_id", userId).eq("review_status", "pending");
  if ((pending ?? []).length >= MAX_PENDING) return fail("too_many_pending");

  const id = await freeSongId(db, slugify(`${song.title} ${artist.name}`).slice(0, 80));
  const now = new Date().toISOString();
  const { error } = await db.from("songs").insert({
    id,
    title: song.title,
    artist: artist.name,
    language: song.language,
    speech_lang: SPEECH_LANG[song.language],
    level: song.level,
    duration_sec: song.duration,
    audio_path: song.audioPath,
    license: "artist-upload",
    is_published: false,
    artist_id: userId,
    review_status: "pending",
    rights_confirmed_at: now,
    submitted_at: now,
  });
  if (error) throw new Error(error.message);

  await db.from("lyric_lines").insert(song.lines.map((line, idx) => ({ song_id: id, idx, start_sec: line.start, end_sec: line.end, text: line.text })));
  const words = song.lines.flatMap((line, idx) => {
    const texts = lineWords(line.text);
    return (line.words ?? [])
      .slice(0, texts.length)
      .filter((w) => w.end > w.start)
      .map((w, word_idx) => ({ song_id: id, line_idx: idx, word_idx, text: texts[word_idx], word_key: wordKey(texts[word_idx]), start_sec: w.start, end_sec: w.end }));
  });
  if (words.length) await db.from("lyric_words").insert(words);
  const translations = song.lines.flatMap((line, idx) =>
    Object.entries(line.translations)
      .filter(([language, text]) => language !== song.language && text?.trim())
      .map(([language, text]) => ({ song_id: id, line_idx: idx, language, text: text!.trim(), source: "human" })),
  );
  if (translations.length) await db.from("line_translations").insert(translations);
  return { ok: true, data: { id } };
}

export type PendingSong = { id: string; title: string; artist: string; language: string; submittedAt: string; audioPath: string | null; lines: string[] };

export async function pendingSongs(db: SupabaseClient): Promise<PendingSong[]> {
  const { data } = await db
    .from("songs")
    .select("id, title, artist, language, submitted_at, audio_path")
    .eq("review_status", "pending")
    .order("submitted_at", { ascending: true })
    .limit(50);
  const songs = (data ?? []) as { id: string; title: string; artist: string; language: string; submitted_at: string; audio_path: string | null }[];
  return Promise.all(
    songs.map(async (song) => {
      const { data: lines } = await db.from("lyric_lines").select("idx, text").eq("song_id", song.id).order("idx", { ascending: true });
      return {
        id: song.id,
        title: song.title,
        artist: song.artist,
        language: song.language,
        submittedAt: song.submitted_at,
        audioPath: song.audio_path,
        lines: ((lines ?? []) as { text: string }[]).map((l) => l.text),
      };
    }),
  );
}

/** Approve (publish) or reject a submission, with an optional note for the artist. */
export async function reviewSong(db: SupabaseClient, songId: string, approve: boolean, note: string): Promise<void> {
  await db
    .from("songs")
    .update({ is_published: approve, review_status: approve ? "approved" : "rejected", review_note: note.slice(0, 500) || null })
    .eq("id", songId)
    .eq("review_status", "pending");
}
