import { NextResponse } from "next/server";
import { isPlan } from "@/lib/billing";
import { getSupabaseAdmin, userFromRequest } from "@/lib/server/supabaseAdmin";
import { billingConfigured, getStripe, priceFor } from "@/lib/server/stripe";

/** Starts a Stripe Checkout for the chosen plan (monthly by default) and returns its URL. */
export async function POST(request: Request) {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  if (!billingConfigured() || !stripe || !supabase) {
    return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  }
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  const plan = body?.plan === undefined ? "monthly" : body.plan;
  if (!isPlan(plan)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const price = priceFor(plan);
  if (!price) return NextResponse.json({ error: "plan_not_offered" }, { status: 422 });

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subscription?.status === "active") return NextResponse.json({ error: "already_subscribed" }, { status: 409 });

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { plan },
    subscription_data: { metadata: { plan } },
    ...(subscription?.stripe_customer_id
      ? { customer: subscription.stripe_customer_id }
      : { customer_email: user.email }),
    allow_promotion_codes: true,
    success_url: `${origin}/settings?checkout=success`,
    cancel_url: `${origin}/settings?checkout=canceled`,
  });
  return NextResponse.json({ url: session.url });
}
