import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin, userFromRequest } from "./supabaseAdmin";

/** AI requests per day. Signed-in learners get more than guests; both can be changed in the environment. */
export const DEFAULT_DAILY_LIMITS = { user: 150, guest: 40 } as const;

function limitFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** The first address in x-forwarded-for (set by Vercel), else x-real-ip. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Guests are counted by a salted hash of their address, so no raw IP is stored. */
export function guestSubject(ip: string, salt: string): string {
  return `ip:${createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)}`;
}

let warnedUnavailable = false;

/**
 * Counts one AI request against today's limit. Returns false once the learner
 * (or guest address) has used it up. Without a database, or if counting
 * fails (e.g. the ai_limits migration has not run yet), requests are allowed
 * so the AI keeps working; the failure is logged once.
 */
export async function takeAiRequest(request: Request): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return true;
  const user = await userFromRequest(request);
  const subject = user
    ? `user:${user.id}`
    : guestSubject(clientIp(request), process.env.AI_LIMIT_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  const limit = user
    ? limitFromEnv("AI_DAILY_LIMIT_USER", DEFAULT_DAILY_LIMITS.user)
    : limitFromEnv("AI_DAILY_LIMIT_GUEST", DEFAULT_DAILY_LIMITS.guest);
  const { data, error } = await db.rpc("take_ai_request", {
    p_subject: subject,
    p_limit: limit,
  });
  if (error) {
    if (!warnedUnavailable) console.error("AI limits unavailable, allowing requests:", error.message);
    warnedUnavailable = true;
    return true;
  }
  return data === true;
}
