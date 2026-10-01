import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan, SubscriptionStatus } from "../billing";

// App Store and Google Play subscriptions, reported by RevenueCat webhooks.
// The mobile app identifies buyers with their Verso (Supabase) user id.

export type StoreEvent = {
  type: string;
  app_user_id: string;
  product_id?: string;
  store?: string;
  expiration_at_ms?: number | null;
};

const ACTIVE = ["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT"];

/** Verso status for a store event, or null when it doesn't change access (e.g. a cancellation still runs to the period end). */
export function statusForStoreEvent(type: string): SubscriptionStatus | null {
  if (ACTIVE.includes(type)) return "active";
  if (type === "BILLING_ISSUE") return "past_due";
  if (type === "EXPIRATION") return "canceled";
  return null;
}

/** Plan from the store product id, e.g. "verso_yearly" → yearly. */
export function planForProduct(productId: string | undefined): Plan {
  const id = (productId ?? "").toLowerCase();
  if (id.includes("family")) return "family";
  if (id.includes("year") || id.includes("annual")) return "yearly";
  return "monthly";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function applyStoreEvent(db: SupabaseClient, event: StoreEvent): Promise<"applied" | "ignored"> {
  const status = statusForStoreEvent(event.type);
  // Anonymous RevenueCat ids ($RCAnonymousID:…) aren't Verso accounts.
  if (!status || !UUID.test(event.app_user_id)) return "ignored";
  const source = event.store === "PLAY_STORE" ? "play_store" : "app_store";
  const { data: current } = await db.from("subscriptions").select("status, source").eq("user_id", event.app_user_id).maybeSingle();
  // Never let a store event end an active web (Stripe) subscription.
  if (current?.status === "active" && current.source === "stripe" && status !== "active") return "ignored";
  const expires = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
  await db
    .from("subscriptions")
    .upsert(
      { user_id: event.app_user_id, status, plan: planForProduct(event.product_id), source, store_expires_at: expires },
      { onConflict: "user_id" },
    );
  return "applied";
}
