import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { isPlan, statusFromStripe } from "@/lib/billing";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getStripe, planForPrice } from "@/lib/server/stripe";

/**
 * Stripe → Verso: keeps public.subscriptions in step with payments. Every
 * request must carry a valid Stripe signature; anything else is rejected.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !supabase || !secret) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("missing signature");
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (userId && customer && session.mode === "subscription") {
      const plan = isPlan(session.metadata?.plan) ? session.metadata.plan : "monthly";
      const { error } = await supabase
        .from("subscriptions")
        .upsert({ user_id: userId, status: "active", stripe_customer_id: customer, plan, source: "stripe" }, { onConflict: "user_id" });
      if (error) return NextResponse.json({ error: "db_error" }, { status: 500 }); // Stripe retries
    }
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object;
    const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const status = event.type === "customer.subscription.deleted" ? "canceled" : statusFromStripe(subscription.status);
    // A plan change in the customer portal shows up as a new price.
    const plan = planForPrice(subscription.items?.data?.[0]?.price?.id) ?? (isPlan(subscription.metadata?.plan) ? subscription.metadata.plan : null);
    const { error } = await supabase
      .from("subscriptions")
      .update(plan ? { status, plan } : { status })
      .eq("stripe_customer_id", customer);
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
