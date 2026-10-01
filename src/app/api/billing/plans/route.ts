import { NextResponse } from "next/server";
import { PLANS, type Plan } from "@/lib/billing";
import { billingConfigured, getStripe, priceFor } from "@/lib/server/stripe";

export type PlanOffer = { plan: Plan; amount: number | null; currency: string; interval: string | null };

let cache: { at: number; offers: PlanOffer[] } | null = null;

/** The plans on offer, with prices from Stripe (cached for 10 minutes). */
export async function GET() {
  const stripe = getStripe();
  if (!billingConfigured() || !stripe) return NextResponse.json({ plans: [] });
  if (cache && Date.now() - cache.at < 10 * 60_000) return NextResponse.json({ plans: cache.offers });
  const offers: PlanOffer[] = [];
  for (const plan of PLANS) {
    const id = priceFor(plan);
    if (!id) continue;
    try {
      const price = await stripe.prices.retrieve(id);
      offers.push({ plan, amount: price.unit_amount, currency: price.currency, interval: price.recurring?.interval ?? null });
    } catch {
      offers.push({ plan, amount: null, currency: "", interval: null });
    }
  }
  cache = { at: Date.now(), offers };
  return NextResponse.json({ plans: offers });
}
