// Subscription and free-trial rules shared by the app and the server.

/** Songs a learner may open before subscribing. */
export const TRIAL_SONGS = 3;

export type SubscriptionStatus = "trial" | "active" | "past_due" | "canceled";

export const PLANS = ["monthly", "yearly", "family"] as const;
export type Plan = (typeof PLANS)[number];

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}

/** People a family plan owner can add (besides themselves). */
export const FAMILY_SEATS = 5;

export type SongAccess =
  | { allowed: true; trialNumber: number | null } // trialNumber = which free song this is (1–3), null if not counted
  | { allowed: false };

/**
 * Can the learner open this song? Free songs (the demo) never count.
 * Subscribers open everything. Otherwise songs already started stay open
 * and new ones open until TRIAL_SONGS have been started.
 */
export function songAccess(
  songId: string,
  { free, subscribed, trialSongs }: { free: boolean; subscribed: boolean; trialSongs: readonly string[] },
): SongAccess {
  if (free || subscribed) return { allowed: true, trialNumber: null };
  const started = trialSongs.indexOf(songId);
  if (started >= 0) return { allowed: true, trialNumber: started + 1 };
  if (trialSongs.length < TRIAL_SONGS) return { allowed: true, trialNumber: trialSongs.length + 1 };
  return { allowed: false };
}

/** Verso's status for a Stripe subscription status. */
export function statusFromStripe(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    default:
      return "canceled"; // canceled, incomplete_expired, paused
  }
}
