import { describe, expect, it } from "vitest";
import { lrcToTaps, parseLrc } from "./lrc";
import { buildTiming } from "./song";

describe("LRC import", () => {
  it("reads metadata, line times, repeats and instrumental breaks", () => {
    const lrc = parseLrc(`[ti:Petite Mer]
[ar:Cleo]
[00:01.00]Je marche vers la mer
[00:05.50]
[00:07.00][00:20.00]La mer chante
not a lyric line`);
    expect(lrc.title).toBe("Petite Mer");
    expect(lrc.artist).toBe("Cleo");
    expect(lrc.lines.map((l) => [l.start, l.text])).toEqual([
      [1, "Je marche vers la mer"],
      [5.5, ""],
      [7, "La mer chante"],
      [20, "La mer chante"],
    ]);
  });

  it("uses enhanced word times and applies the offset", () => {
    const lrc = parseLrc(`[offset:+500]
[00:02.00]<00:02.00>Je <00:02.40>marche <00:03.10>vers <00:03.50>la <00:03.80>mer`);
    expect(lrc.lines[0]).toEqual({ start: 1.5, text: "Je marche vers la mer", wordStarts: [1.5, 1.9, 2.6, 3, 3.3] });
    // A word count mismatch drops the word times.
    expect(parseLrc("[00:02.00]<00:02.00>Je <00:02.40>marche vers").lines[0].wordStarts).toBeUndefined();
  });

  it("turns lines into taps the timing tool can finish", () => {
    const lrc = parseLrc(`[00:01.00]Je marche vers la mer
[00:04.00]
[00:07.00]<00:07.00>La <00:07.30>mer <00:07.80>chante`);
    const { lyrics, taps } = lrcToTaps(lrc, 12);
    expect(lyrics).toBe("Je marche vers la mer\nLa mer chante");
    // 3 s for 5 words = 0.6 s apart; the break at 4 s ends the first line.
    expect(taps).toEqual([1, 1.6, 2.2, 2.8, 3.4, 7, 7.3, 7.8]);
    const timed = buildTiming(lyrics.split("\n"), taps, 12)!;
    expect(timed.map((l) => [l.start, l.text])).toEqual([
      [1, "Je marche vers la mer"],
      [7, "La mer chante"],
    ]);
  });
});
