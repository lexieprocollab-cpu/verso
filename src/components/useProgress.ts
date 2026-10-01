"use client";

import { activityStore, knownWordsStore, reviewsStore, wordId } from "@/lib/learnerStores";
import { dayKey, streak, understoodPercent } from "@/lib/progress";
import type { Song } from "@/lib/song";
import { isKnown } from "@/lib/srs";

/** Percent of the song's words the learner knows ("I know it" or learned in review). */
export function useUnderstood(song: Song): number {
  const known = knownWordsStore.useValue();
  const reviews = reviewsStore.useValue();
  return understoodPercent(song, (key) => {
    const id = wordId(song.id, key);
    return known.includes(id) || isKnown(reviews[id]);
  });
}

export function useStreak(): number {
  return streak(activityStore.useValue(), dayKey(new Date()));
}
