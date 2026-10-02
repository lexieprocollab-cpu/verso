import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export type DeleteAccountResult = { ok: true; storeSubscription: boolean } | { ok: false; error: string };

/**
 * Deletes a learner's account and their personal data (App Store guideline
 * 5.1.1(v), GDPR). In order:
 *  1. Stripe: the customer is deleted, which cancels any web subscription
 *     at once so they are never charged again.
 *  2. Songs they uploaded as an artist, and the audio files behind them.
 *  3. The auth user. Every table keyed by user id (profile, words, progress,
 *     messages, follows, family, subscription…) is removed with it by
 *     `on delete cascade`.
 * App Store / Google Play subscriptions cannot be cancelled from a server;
 * `storeSubscription` tells the app to remind the learner to cancel there.
 */
export async function deleteAccount(db: SupabaseClient, stripe: Stripe | null, userId: string): Promise<DeleteAccountResult> {
  const { data: subscription } = await db
    .from("subscriptions")
    .select("stripe_customer_id, status, source")
    .eq("user_id", userId)
    .maybeSingle();
  const sub = subscription as {
    stripe_customer_id: string | null;
    status: string;
    source?: string;
  } | null;

  if (sub?.stripe_customer_id) {
    if (!stripe) return { ok: false, error: "billing_unavailable" };
    try {
      await stripe.customers.del(sub.stripe_customer_id);
    } catch (error) {
      // Already deleted in Stripe is fine; anything else stops here so nobody keeps being billed.
      if ((error as { code?: string }).code !== "resource_missing") throw error;
    }
  }

  const { data: songs } = await db.from("songs").select("id, audio_path").eq("artist_id", userId);
  const uploaded = (songs ?? []) as { id: string; audio_path: string | null }[];
  const files = uploaded.map((s) => s.audio_path).filter((p): p is string => Boolean(p?.startsWith(`${userId}/`)));
  if (uploaded.length) {
    const { error } = await db.from("songs").delete().eq("artist_id", userId);
    if (error) throw new Error(error.message);
  }
  if (files.length) {
    const { error } = await db.storage.from("audio").remove(files);
    if (error) console.error("Could not remove uploaded audio", error.message);
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  const storeSubscription = Boolean(sub && (sub.source === "app_store" || sub.source === "play_store") && sub.status === "active");
  return { ok: true, storeSubscription };
}
