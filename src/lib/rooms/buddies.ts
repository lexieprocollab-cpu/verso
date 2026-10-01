import type { UiLanguage } from "../i18n";

// Language buddies: "speaks Hebrew, learning French" ↔ "speaks French,
// learning Hebrew". Shared by the server and the device demo.

export type BuddyProfile = { id: string; speaks: UiLanguage | null; learning: UiLanguage[]; favorites: string[] };

export type BuddyMatch = {
  /** They speak what you learn AND learn what you speak. */
  mutual: boolean;
  /** They speak a language you're learning. */
  helps: boolean;
  score: number;
};

export function matchBuddy(me: BuddyProfile, other: BuddyProfile): BuddyMatch | null {
  if (other.id === me.id) return null;
  const helps = other.speaks !== null && me.learning.includes(other.speaks);
  const helped = me.speaks !== null && other.learning.includes(me.speaks);
  if (!helps && !helped) return null;
  const sharedSongs = other.favorites.filter((song) => me.favorites.includes(song)).length;
  return { mutual: helps && helped, helps, score: (helps ? 2 : 0) + (helped ? 1 : 0) + (helps && helped ? 2 : 0) + sharedSongs };
}

/** Best matches first. Minors are only matched with minors, adults with adults. */
export function rankBuddies<T extends BuddyProfile & { adult: boolean }>(me: BuddyProfile & { adult: boolean }, others: T[], limit = 30) {
  return others
    .filter((other) => other.adult === me.adult)
    .map((other) => ({ profile: other, match: matchBuddy(me, other) }))
    .filter((entry): entry is { profile: T; match: BuddyMatch } => entry.match !== null)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit);
}

export type DirectRuleInput = {
  senderAdult: boolean;
  recipientAdult: boolean;
  /** The minor in the pair follows the adult (only matters for mixed pairs). */
  minorFollowsAdult: boolean;
  blockedEitherWay: boolean;
};

/**
 * Who may message whom. An under-18 may message an adult only if they follow
 * them, and an adult may reply to a minor only in that same case.
 */
export function directMessageRule(input: DirectRuleInput): "ok" | "blocked" | "follow_needed" | "not_allowed" {
  if (input.blockedEitherWay) return "blocked";
  if (input.senderAdult === input.recipientAdult) return "ok";
  if (input.minorFollowsAdult) return "ok";
  return input.senderAdult ? "not_allowed" : "follow_needed";
}
