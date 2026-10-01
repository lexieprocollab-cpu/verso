import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIO_TYPES, MAX_AUDIO_BYTES, artistProfileSchema, type ArtistProfile, type ReviewStatus } from "./artists";
import { saveLocalSong } from "./localSongs";
import { createLocalStore, parseJson } from "./localStore";
import type { Song } from "./song";

// Artist uploads from the browser: the cloud version talks to /api/artists and
// Supabase Storage; the device demo keeps the artist profile and submissions
// on this device, with this device acting as the reviewer.

export type ArtistError = "sign_in_required" | "artist_needed" | "slug_taken" | "bad_audio" | "audio_needed" | "too_many_pending" | "not_allowed" | "failed";
export type MySong = { id: string; title: string; status: ReviewStatus; note: string | null };
export type PendingSong = { id: string; title: string; artist: string; language: string; lines: string[] };

export type ArtistClient = {
  kind: "cloud" | "device";
  /** Your artist profile, null if you haven't made one, "signed_out" in the cloud without sign-in. */
  mine(): Promise<ArtistProfile | null | "signed_out">;
  save(profile: ArtistProfile): Promise<{ ok: true } | { ok: false; error: ArtistError }>;
  mySongs(): Promise<MySong[]>;
  submit(song: Song, audio: File | null): Promise<{ ok: true; id: string } | { ok: false; error: ArtistError }>;
  bySlug(slug: string): Promise<ArtistProfile | null>;
  /** Songs waiting for review, or null if you're not a moderator. */
  pending(): Promise<PendingSong[] | null>;
  review(songId: string, approve: boolean, note: string): Promise<void>;
};

export function checkAudio(file: File): boolean {
  return AUDIO_TYPES.includes(file.type) && file.size > 0 && file.size <= MAX_AUDIO_BYTES;
}

const submissionOf = (song: Song) => ({
  title: song.title,
  language: song.language,
  level: song.level,
  duration: Math.round(song.duration * 100) / 100,
  lines: song.lines.map((line) => ({ start: line.start, end: line.end, text: line.text, translations: line.translations, words: line.words })),
});

export function createCloudArtists(db: SupabaseClient): ArtistClient {
  async function session() {
    return (await db.auth.getSession()).data.session;
  }
  async function api(method: "GET" | "POST", action: string, body?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: ArtistError }> {
    const token = (await session())?.access_token;
    if (!token) return { ok: false, error: "sign_in_required" };
    try {
      const response = await fetch(`/api/artists/${action}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data: unknown = await response.json().catch(() => null);
      if (response.ok) return { ok: true, data };
      return { ok: false, error: (data as { error?: ArtistError } | null)?.error ?? "failed" };
    } catch {
      return { ok: false, error: "failed" };
    }
  }

  return {
    kind: "cloud",
    async mine() {
      const user = (await session())?.user;
      if (!user) return "signed_out";
      const { data } = await db.from("artists").select("slug, name, bio, links").eq("id", user.id).maybeSingle();
      return (data as ArtistProfile | null) ?? null;
    },
    async save(profile) {
      const outcome = await api("POST", "profile", profile);
      return outcome.ok ? { ok: true } : outcome;
    },
    async mySongs() {
      const user = (await session())?.user;
      if (!user) return [];
      const { data } = await db.from("songs").select("id, title, review_status, review_note").eq("artist_id", user.id).order("submitted_at", { ascending: false });
      return ((data ?? []) as { id: string; title: string; review_status: ReviewStatus; review_note: string | null }[]).map((row) => ({
        id: row.id,
        title: row.title,
        status: row.review_status,
        note: row.review_note,
      }));
    },
    async submit(song, audio) {
      if (!audio) return { ok: false, error: "audio_needed" };
      if (!checkAudio(audio)) return { ok: false, error: "bad_audio" };
      const upload = await api("POST", "upload", { contentType: audio.type, size: audio.size });
      if (!upload.ok) return upload;
      const { path, token } = upload.data as { path: string; token: string };
      const { error } = await db.storage.from("audio").uploadToSignedUrl(path, token, audio, { contentType: audio.type });
      if (error) return { ok: false, error: "failed" };
      const outcome = await api("POST", "submit", { ...submissionOf(song), audioPath: path, rightsConfirmed: true });
      return outcome.ok ? { ok: true, id: (outcome.data as { id: string }).id } : outcome;
    },
    async bySlug(slug) {
      const { data } = await db.from("artists").select("slug, name, bio, links").eq("slug", slug).maybeSingle();
      return (data as ArtistProfile | null) ?? null;
    },
    async pending() {
      const outcome = await api("GET", "review");
      return outcome.ok ? (outcome.data as { items: PendingSong[] }).items : null;
    },
    async review(songId, approve, note) {
      await api("POST", "review", { songId, approve, note });
    },
  };
}

// ---------------------------------------------------------------------------
// Device demo

type Submission = { song: Song; status: ReviewStatus; note: string | null };

const isProfile = (value: unknown): value is ArtistProfile | null => value === null || artistProfileSchema.safeParse(value).success;
const isSubmissions = (value: unknown): value is Submission[] =>
  Array.isArray(value) && value.every((s) => typeof s === "object" && s !== null && "song" in s && "status" in s);

export const deviceArtistStore = createLocalStore<ArtistProfile | null>("verso.artist", null, (raw) => parseJson(raw, null, isProfile));
export const deviceSubmissionsStore = createLocalStore<Submission[]>("verso.artistSubmissions", [], (raw) => parseJson(raw, [], isSubmissions));

export function createDeviceArtists(): ArtistClient {
  return {
    kind: "device",
    async mine() {
      return deviceArtistStore.get();
    },
    async save(profile) {
      deviceArtistStore.set(artistProfileSchema.parse(profile));
      return { ok: true };
    },
    async mySongs() {
      return deviceSubmissionsStore.get().map(({ song, status, note }) => ({ id: song.id, title: song.title, status, note }));
    },
    async submit(song) {
      const artist = deviceArtistStore.get();
      if (!artist) return { ok: false, error: "artist_needed" };
      const submissions = deviceSubmissionsStore.get();
      if (submissions.filter((s) => s.status === "pending").length >= 5) return { ok: false, error: "too_many_pending" };
      let id = song.id;
      for (let n = 2; submissions.some((s) => s.song.id === id); n++) id = `${song.id}-${n}`;
      deviceSubmissionsStore.set([{ song: { ...song, id, artist: artist.name, artistSlug: artist.slug, license: "artist-upload" }, status: "pending", note: null }, ...submissions]);
      return { ok: true, id };
    },
    async bySlug(slug) {
      const artist = deviceArtistStore.get();
      return artist?.slug === slug ? artist : null;
    },
    async pending() {
      return deviceSubmissionsStore
        .get()
        .filter((s) => s.status === "pending")
        .map(({ song }) => ({ id: song.id, title: song.title, artist: song.artist, language: song.language, lines: song.lines.map((l) => l.text) }));
    },
    async review(songId, approve, note) {
      const submissions = deviceSubmissionsStore.get();
      const target = submissions.find((s) => s.song.id === songId && s.status === "pending");
      if (!target) return;
      deviceSubmissionsStore.set(
        submissions.map((s) => (s === target ? { ...s, status: approve ? "approved" : "rejected", note: note.trim() || null } : s)),
      );
      if (approve) saveLocalSong(target.song);
    },
  };
}
