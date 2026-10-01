import * as z from "zod/v4";

// Anonymous product analytics: a random device id and session id, the event
// name and a few small properties. No names, emails or lyrics are sent.

export const EVENT_NAMES = [
  "session_start",
  "onboarding_completed",
  "song_opened",
  "word_saved",
  "quiz_completed",
  "review_answered",
  "trial_song_started",
  "paywall_shown",
  "checkout_started",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

const propValue = z.union([z.string().max(120), z.number(), z.boolean()]);

export const analyticsEvent = z.object({
  anonId: z.uuid(),
  sessionId: z.uuid(),
  name: z.enum(EVENT_NAMES),
  props: z
    .record(z.string().max(40), propValue)
    .refine((props) => Object.keys(props).length <= 10, "too many properties")
    .optional(),
});
export const analyticsBatch = z.array(analyticsEvent).min(1).max(25);
export type AnalyticsEvent = z.infer<typeof analyticsEvent>;

/** A session ends after 30 minutes without activity. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

export function sessionIsFresh(lastActivity: number | null, now: number): boolean {
  return lastActivity !== null && now - lastActivity < SESSION_IDLE_MS;
}
