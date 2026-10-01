import { UI_LANGUAGES, isUiLanguage, type UiLanguage } from "./i18n";
import { createLocalStore, parseJson } from "./localStore";
import { SPEECH_LANG, buildTiming, lineWords, slugify, type Song } from "./song";

// The song timing tool's work in progress, kept on the device so a refresh
// doesn't lose an hour of tapping. The audio file itself is not stored.

export type StudioDraft = {
  title: string;
  artist: string;
  language: UiLanguage;
  level: Song["level"];
  license: string;
  /** Web address of the audio (optional; a file picked from the device is used for this session only). */
  audioUrl: string;
  /** Official YouTube video id, played instead of the audio (licensed songs). */
  youtubeId?: string;
  lyrics: string;
  /** Start time of each word, in singing order. */
  taps: number[];
  /** Line translations per language, one entry per lyric line. */
  translations: Partial<Record<UiLanguage, string[]>>;
};

export const EMPTY_DRAFT: StudioDraft = {
  title: "",
  artist: "",
  language: "en",
  level: "beginner",
  license: "",
  audioUrl: "",
  lyrics: "",
  taps: [],
  translations: {},
};

function isDraft(value: unknown): value is StudioDraft {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.title === "string" &&
    typeof d.lyrics === "string" &&
    isUiLanguage(d.language) &&
    Array.isArray(d.taps) &&
    d.taps.every((t) => typeof t === "number") &&
    typeof d.translations === "object" &&
    d.translations !== null
  );
}

export const studioDraftStore = createLocalStore<StudioDraft>("verso.studioDraft", EMPTY_DRAFT, (raw) =>
  parseJson(raw, EMPTY_DRAFT, isDraft),
);

export function updateDraft(patch: Partial<StudioDraft>) {
  studioDraftStore.set({ ...studioDraftStore.get(), ...patch });
}

/** Non-empty lyric lines, trimmed. */
export function draftLines(draft: StudioDraft): string[] {
  return draft.lyrics
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => lineWords(line).length > 0);
}

export function draftWordCount(draft: StudioDraft): number {
  return draftLines(draft).reduce((sum, line) => sum + lineWords(line).length, 0);
}

/**
 * The finished song, or a list of what's still missing. Translations are
 * optional per language, but a started language must cover every line.
 */
export function songFromDraft(
  draft: StudioDraft,
  duration: number,
  audioUrl: string | undefined,
): { song: Song; missing: [] } | { song: null; missing: string[] } {
  const lines = draftLines(draft);
  const missing: string[] = [];
  if (!draft.title.trim()) missing.push("title");
  if (!draft.artist.trim()) missing.push("artist");
  if (!draft.license.trim()) missing.push("license");
  if (lines.length === 0) missing.push("lyrics");
  const timed = buildTiming(lines, draft.taps, duration);
  if (!timed) missing.push("timing");
  for (const lang of UI_LANGUAGES) {
    const list = draft.translations[lang];
    if (list?.some((text) => text.trim()) && lines.some((_, i) => !list[i]?.trim())) missing.push(`translation:${lang}`);
  }
  if (missing.length || !timed) return { song: null, missing };

  return {
    missing: [],
    song: {
      id: slugify(`${draft.title} ${draft.artist}`),
      title: draft.title.trim(),
      artist: draft.artist.trim(),
      language: draft.language,
      speechLang: SPEECH_LANG[draft.language],
      level: draft.level,
      duration,
      audioUrl,
      youtubeId: draft.youtubeId && /^[A-Za-z0-9_-]{11}$/.test(draft.youtubeId) ? draft.youtubeId : undefined,
      license: draft.license.trim(),
      lines: timed.map((line, i) => {
        const translations: Partial<Record<UiLanguage, string>> = {};
        for (const lang of UI_LANGUAGES) {
          const text = draft.translations[lang]?.[i]?.trim();
          if (lang !== draft.language && text) translations[lang] = text;
        }
        return { ...line, translations };
      }),
      glossary: {},
      quiz: [],
    },
  };
}
