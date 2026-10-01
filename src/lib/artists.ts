import * as z from "zod/v4";
import { UI_LANGUAGES } from "./i18n";

// Artist uploads (step 28): shared rules for the artist profile and a song
// submission. The server validates with these before anything is stored.

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const AUDIO_TYPES = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm", "audio/flac"];

const lang = z.enum(UI_LANGUAGES);
const httpsUrl = z
  .string()
  .trim()
  .max(200)
  .refine((value) => /^https:\/\/[^\s]+$/.test(value), "https link");

export const artistProfileSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "2-40 letters, digits or dashes"),
  name: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(1000).default(""),
  links: z.array(httpsUrl).max(3).default([]),
});
export type ArtistProfile = z.infer<typeof artistProfileSchema>;

const seconds = z.number().finite().min(0).max(1200);

export const songSubmissionSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    language: lang,
    level: z.enum(["beginner", "intermediate", "advanced"]),
    duration: z.number().finite().positive().max(1200),
    lines: z
      .array(
        z.object({
          start: seconds,
          end: seconds,
          text: z.string().trim().min(1).max(300),
          translations: z.partialRecord(lang, z.string().max(300)).default({}),
          words: z.array(z.object({ start: seconds, end: seconds })).max(80).optional(),
        }),
      )
      .min(1)
      .max(300),
    /** Object path from the upload step, e.g. "<user id>/<uuid>.mp3". */
    audioPath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/),
    /** The artist confirms they own the song or have permission to share it. */
    rightsConfirmed: z.literal(true),
  })
  .refine((song) => song.lines.every((line) => line.end > line.start), "every line ends after it starts");
export type SongSubmission = z.infer<typeof songSubmissionSchema>;

export type ReviewStatus = "pending" | "approved" | "rejected";

export const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
};
