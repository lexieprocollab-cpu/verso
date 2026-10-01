import type { SupabaseClient } from "@supabase/supabase-js";
import { isUiLanguage, type UiLanguage } from "./i18n";
import { SPEECH_LANG, type Gloss, type Song } from "./song";

// Published songs from the database (artist uploads and, with step 6, the
// licensed catalog), turned into the same Song shape as the bundled demo.

type SongRow = {
  id: string;
  title: string;
  artist: string;
  language: string;
  speech_lang: string | null;
  level: Song["level"];
  duration_sec: number | string;
  audio_path: string | null;
  youtube_id?: string | null;
  license: string;
  artists: { slug: string } | { slug: string }[] | null;
};
type LineRow = { song_id: string; idx: number; start_sec: number | string; end_sec: number | string; text: string };
type WordRow = { song_id: string; line_idx: number; word_idx: number; start_sec: number | string; end_sec: number | string };
type TranslationRow = { song_id: string; line_idx: number; language: string; text: string };
type GlossRow = { song_id: string; word_key: string; language: string; meaning: string; lemma: string | null; note: string | null };

export type CatalogRows = { songs: SongRow[]; lines: LineRow[]; words: WordRow[]; translations: TranslationRow[]; glossary: GlossRow[] };

/** Builds songs from table rows; songs without lyrics are skipped. */
export function songsFromRows(rows: CatalogRows, audioUrl: (path: string) => string): Song[] {
  const songs: Song[] = [];
  for (const row of rows.songs) {
    if (!isUiLanguage(row.language)) continue;
    const lines = rows.lines.filter((l) => l.song_id === row.id).sort((a, b) => a.idx - b.idx);
    if (!lines.length) continue;
    const glossary: Record<string, Gloss> = {};
    for (const g of rows.glossary.filter((g) => g.song_id === row.id && isUiLanguage(g.language))) {
      const entry = (glossary[g.word_key] ??= { meanings: {} });
      entry.meanings[g.language as UiLanguage] = g.meaning;
      if (g.lemma) entry.lemma = g.lemma;
      if (g.note) entry.note = g.note;
    }
    const artist = Array.isArray(row.artists) ? row.artists[0] : row.artists;
    songs.push({
      id: row.id,
      title: row.title,
      artist: row.artist,
      artistSlug: artist?.slug,
      language: row.language,
      speechLang: row.speech_lang ?? SPEECH_LANG[row.language],
      level: row.level,
      duration: Number(row.duration_sec),
      audioUrl: row.audio_path ? audioUrl(row.audio_path) : undefined,
      youtubeId: row.youtube_id ?? undefined,
      license: row.license,
      lines: lines.map((line) => {
        const words = rows.words.filter((w) => w.song_id === row.id && w.line_idx === line.idx).sort((a, b) => a.word_idx - b.word_idx);
        const translations: Partial<Record<UiLanguage, string>> = {};
        for (const tr of rows.translations) {
          if (tr.song_id === row.id && tr.line_idx === line.idx && isUiLanguage(tr.language)) translations[tr.language] = tr.text;
        }
        return {
          start: Number(line.start_sec),
          end: Number(line.end_sec),
          text: line.text,
          translations,
          words: words.length ? words.map((w) => ({ start: Number(w.start_sec), end: Number(w.end_sec) })) : undefined,
        };
      }),
      glossary,
      quiz: [],
    });
  }
  return songs;
}

/** Published songs readable under row-level security (up to 200 for now). */
export async function fetchPublishedSongs(db: SupabaseClient): Promise<Song[]> {
  const { data: songs } = await db
    .from("songs")
    .select("id, title, artist, language, speech_lang, level, duration_sec, audio_path, youtube_id, license, artists(slug)")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = ((songs ?? []) as SongRow[]).map((s) => s.id);
  if (!ids.length) return [];
  const [lines, words, translations, glossary] = await Promise.all([
    db.from("lyric_lines").select("song_id, idx, start_sec, end_sec, text").in("song_id", ids),
    db.from("lyric_words").select("song_id, line_idx, word_idx, start_sec, end_sec").in("song_id", ids),
    db.from("line_translations").select("song_id, line_idx, language, text").in("song_id", ids),
    db.from("glossary").select("song_id, word_key, language, meaning, lemma, note").in("song_id", ids),
  ]);
  return songsFromRows(
    {
      songs: songs as SongRow[],
      lines: (lines.data ?? []) as LineRow[],
      words: (words.data ?? []) as WordRow[],
      translations: (translations.data ?? []) as TranslationRow[],
      glossary: (glossary.data ?? []) as GlossRow[],
    },
    (path) => db.storage.from("audio").getPublicUrl(path).data.publicUrl,
  );
}
