import "server-only";
import Stripe from "stripe";
import type { Plan } from "../billing";

let stripe: Stripe | null | undefined;

/** Stripe client, or null until STRIPE_SECRET_KEY is set. */
export function getStripe(): Stripe | null {
  if (stripe !== undefined) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  stripe = key ? new Stripe(key) : null;
  return stripe;
}

/** Everything checkout needs: the Stripe key, the subscription price and the database. */
export function billingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_ID &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

/** Stripe price for each plan. Monthly is required; yearly and family are offered once their price is set. */
export function priceFor(plan: Plan, env: Record<string, string | undefined> = process.env): string | undefined {
  const key = { monthly: "STRIPE_PRICE_ID", yearly: "STRIPE_PRICE_ID_YEARLY", family: "STRIPE_PRICE_ID_FAMILY" }[plan];
  return env[key] || undefined;
}

/** Which plan a Stripe price belongs to (for subscription changes made in the customer portal). */
export function planForPrice(priceId: string | undefined, env: Record<string, string | undefined> = process.env): Plan | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_ID_FAMILY) return "family";
  if (priceId === env.STRIPE_PRICE_ID_YEARLY) return "yearly";
  if (priceId === env.STRIPE_PRICE_ID) return "monthly";
  return null;
}
