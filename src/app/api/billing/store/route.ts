import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { applyStoreEvent, type StoreEvent } from "@/lib/server/storeSubscriptions";

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * RevenueCat → Verso: App Store and Google Play subscription changes. RevenueCat
 * sends the Authorization header set in its dashboard (REVENUECAT_WEBHOOK_SECRET).
 */
export async function POST(request: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const db = getSupabaseAdmin();
  if (!secret || !db) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { event?: StoreEvent } | null;
  const event = body?.event;
  if (!event || typeof event.type !== "string" || typeof event.app_user_id !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  return NextResponse.json({ result: await applyStoreEvent(db, event) });
}
