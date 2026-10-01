import { NextResponse } from "next/server";
import { getSupabaseAdmin, userFromRequest } from "@/lib/server/supabaseAdmin";
import { billingConfigured, getStripe } from "@/lib/server/stripe";

/** Opens Stripe's customer portal (change card, cancel) for the signed-in subscriber. */
export async function POST(request: Request) {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  if (!billingConfigured() || !stripe || !supabase) {
    return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  }
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });

  const { data } = await supabase.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!data?.stripe_customer_id) return NextResponse.json({ error: "no_subscription" }, { status: 404 });

  const portal = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${new URL(request.url).origin}/settings`,
  });
  return NextResponse.json({ url: portal.url });
}
