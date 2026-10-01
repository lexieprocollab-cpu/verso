import { lineWords } from "./song";

// LRC: the timed-lyrics format lyrics providers and many tools export.
//   [ti:Title] [ar:Artist] [offset:+250]        metadata (offset in ms)
//   [00:12.30]First line                         line start times
//   [00:12.30]<00:12.30>First <00:12.90>line     "enhanced" LRC: word start times
// A line may carry several times ([00:12.30][01:40.00]chorus). Empty lines mark
// instrumental breaks.

export type LrcLine = { start: number; text: string; wordStarts?: number[] };
export type Lrc = { title?: string; artist?: string; lines: LrcLine[] };

const TIME = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const WORD_TIME = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;

const seconds = (minutes: string, rest: string) => Number(minutes) * 60 + Number(rest.replace(":", "."));

export function parseLrc(source: string): Lrc {
  const lrc: Lrc = { lines: [] };
  let offset = 0;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const meta = line.match(/^\[(ti|ar|offset):\s*(.*)\]$/i);
    if (meta) {
      const [, key, value] = meta;
      if (key.toLowerCase() === "ti") lrc.title = value.trim();
      else if (key.toLowerCase() === "ar") lrc.artist = value.trim();
      else offset = Number(value) / 1000 || 0;
      continue;
    }
    const times = [...line.matchAll(TIME)].map((m) => seconds(m[1], m[2]));
    if (!times.length) continue;
    const body = line.replace(TIME, "");
    const wordTimes = [...body.matchAll(WORD_TIME)].map((m) => seconds(m[1], m[2]));
    const text = body.replace(WORD_TIME, "").replace(/\s+/g, " ").trim();
    for (const time of times) {
      const entry: LrcLine = { start: time, text };
      // Word times only count when there's one per word.
      if (wordTimes.length && wordTimes.length === lineWords(text).length && times.length === 1) entry.wordStarts = wordTimes;
      lrc.lines.push(entry);
    }
  }
  // Positive offset = lyrics appear earlier (LRC convention).
  lrc.lines = lrc.lines
    .map((l) => ({ ...l, start: Math.max(0, l.start - offset), wordStarts: l.wordStarts?.map((w) => Math.max(0, w - offset)) }))
    .sort((a, b) => a.start - b.start);
  return lrc;
}

/**
 * Lyrics text and one tap per word for the song timing tool. Words without
 * their own times are spread evenly over their line (until the next line or
 * break starts, at most 1.2 s per word); fine-tune them by tapping along.
 */
export function lrcToTaps(lrc: Lrc, duration: number): { lyrics: string; taps: number[] } {
  const sung: string[] = [];
  const taps: number[] = [];
  lrc.lines.forEach((line, i) => {
    const words = lineWords(line.text);
    if (!words.length) return;
    sung.push(line.text);
    if (line.wordStarts) {
      taps.push(...line.wordStarts);
      return;
    }
    const next = lrc.lines[i + 1]?.start ?? duration;
    const step = Math.min(1.2, Math.max(0.1, (next - line.start) / words.length));
    words.forEach((_, w) => taps.push(Math.round((line.start + w * step) * 100) / 100));
  });
  return { lyrics: sung.join("\n"), taps };
}
