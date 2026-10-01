import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { songSubmissionSchema } from "../artists";
import { fakeSupabase } from "@/test/fakeSupabase";
import { MAX_PENDING, createAudioUpload, pendingSongs, reviewSong, saveArtist, submitSong } from "./artists";

const CLEO = "33333333-3333-3333-3333-333333333333";
const OTHER = "44444444-4444-4444-4444-444444444444";

function setup() {
  const world = fakeSupabase({ artists: [], songs: [], lyric_lines: [], lyric_words: [], line_translations: [] });
  const uploads: string[] = [];
  (world.db as unknown as { storage: unknown }).storage = {
    from: (bucket: string) => ({
      createSignedUploadUrl: async (path: string) => {
        uploads.push(`${bucket}/${path}`);
        return { data: { signedUrl: `https://storage.test/${path}?token=t`, token: "t" }, error: null };
      },
    }),
  };
  return { ...world, uploads, db: world.db as SupabaseClient };
}

const submission = (audioPath: string) =>
  songSubmissionSchema.parse({
    title: "Petite Mer",
    language: "fr",
    level: "beginner",
    duration: 42,
    audioPath,
    rightsConfirmed: true,
    lines: [
      { start: 1, end: 4, text: "Je marche vers la mer", translations: { en: "I walk to the sea", fr: "ignored" }, words: [{ start: 1, end: 1.5 }, { start: 1.5, end: 2 }, { start: 2, end: 2.5 }, { start: 2.5, end: 3 }, { start: 3, end: 4 }] },
      { start: 4, end: 7, text: "La mer chante", translations: {} },
    ],
  });

describe("artist uploads", () => {
  it("keeps slugs unique per artist", async () => {
    const world = setup();
    expect(await saveArtist(world.db, CLEO, { slug: "cleo", name: "Cleo", bio: "", links: [] })).toEqual({ ok: true, data: null });
    expect(await saveArtist(world.db, CLEO, { slug: "cleo", name: "Cléo", bio: "Paris", links: [] })).toEqual({ ok: true, data: null });
    expect(world.tables.artists).toHaveLength(1);
    expect(world.tables.artists[0]).toMatchObject({ name: "Cléo" });
    expect(await saveArtist(world.db, OTHER, { slug: "cleo", name: "Copy", bio: "", links: [] })).toEqual({ ok: false, error: "slug_taken" });
  });

  it("gives a signed upload URL only to artists, for audio under 20 MB", async () => {
    const world = setup();
    expect(await createAudioUpload(world.db, CLEO, { contentType: "audio/mpeg", size: 1000 })).toEqual({ ok: false, error: "artist_needed" });
    await saveArtist(world.db, CLEO, { slug: "cleo", name: "Cleo", bio: "", links: [] });
    expect(await createAudioUpload(world.db, CLEO, { contentType: "video/mp4", size: 1000 })).toEqual({ ok: false, error: "bad_audio" });
    expect(await createAudioUpload(world.db, CLEO, { contentType: "audio/mpeg", size: 30 * 1024 * 1024 })).toEqual({ ok: false, error: "bad_audio" });
    const upload = await createAudioUpload(world.db, CLEO, { contentType: "audio/mpeg", size: 5_000_000 });
    expect(upload.ok && upload.data.path).toMatch(new RegExp(`^${CLEO}/[0-9a-f-]{36}\\.mp3$`));
    expect(world.uploads[0]).toMatch(/^audio\//);
  });

  it("stores a submission unpublished with lyrics, word timings and translations", async () => {
    const world = setup();
    await saveArtist(world.db, CLEO, { slug: "cleo", name: "Cleo", bio: "", links: [] });
    const path = `${CLEO}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp3`;
    expect(await submitSong(world.db, OTHER, submission(path))).toEqual({ ok: false, error: "artist_needed" });
    const result = await submitSong(world.db, CLEO, submission(path));
    expect(result).toEqual({ ok: true, data: { id: "petite-mer-cleo" } });
    expect(world.tables.songs[0]).toMatchObject({ is_published: false, review_status: "pending", artist: "Cleo", speech_lang: "fr-FR", audio_path: path });
    expect(world.tables.lyric_lines).toHaveLength(2);
    expect(world.tables.lyric_words).toHaveLength(5);
    expect(world.tables.lyric_words[1]).toMatchObject({ text: "marche", word_key: "marche", start_sec: 1.5 });
    expect(world.tables.line_translations).toMatchObject([{ song_id: "petite-mer-cleo", line_idx: 0, language: "en", text: "I walk to the sea", source: "human" }]);

    // Same title again gets a new id.
    expect(await submitSong(world.db, CLEO, submission(path))).toEqual({ ok: true, data: { id: "petite-mer-cleo-2" } });
    // Audio must be the artist's own upload.
    expect(await submitSong(world.db, CLEO, submission(`${OTHER}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp3`))).toEqual({ ok: false, error: "not_allowed" });
  });

  it("limits pending submissions and lets moderators publish or reject", async () => {
    const world = setup();
    await saveArtist(world.db, CLEO, { slug: "cleo", name: "Cleo", bio: "", links: [] });
    const path = `${CLEO}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp3`;
    for (let i = 0; i < MAX_PENDING; i++) await submitSong(world.db, CLEO, submission(path));
    expect(await submitSong(world.db, CLEO, submission(path))).toEqual({ ok: false, error: "too_many_pending" });
    expect((await pendingSongs(world.db))[0]).toMatchObject({ id: "petite-mer-cleo", lines: ["Je marche vers la mer", "La mer chante"] });

    await reviewSong(world.db, "petite-mer-cleo", true, "");
    await reviewSong(world.db, "petite-mer-cleo-2", false, "Please fix the timing of line 2");
    expect(world.tables.songs[0]).toMatchObject({ is_published: true, review_status: "approved" });
    expect(world.tables.songs[1]).toMatchObject({ is_published: false, review_status: "rejected", review_note: "Please fix the timing of line 2" });
    expect(await submitSong(world.db, CLEO, submission(path))).toMatchObject({ ok: true });
  });

  it("rejects submissions without the rights confirmation or with broken timing", () => {
    const base = { title: "x", language: "fr", level: "beginner", duration: 10, audioPath: `${CLEO}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp3` };
    const lines = [{ start: 1, end: 2, text: "la" }];
    expect(songSubmissionSchema.safeParse({ ...base, lines, rightsConfirmed: false }).success).toBe(false);
    expect(songSubmissionSchema.safeParse({ ...base, lines: [{ start: 2, end: 1, text: "la" }], rightsConfirmed: true }).success).toBe(false);
    expect(songSubmissionSchema.safeParse({ ...base, lines, rightsConfirmed: true, audioPath: "../../etc/passwd" }).success).toBe(false);
    expect(songSubmissionSchema.safeParse({ ...base, lines, rightsConfirmed: true }).success).toBe(true);
  });
});
