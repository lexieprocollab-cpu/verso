import { NextResponse } from "next/server";
import { analyticsBatch } from "@/lib/analytics";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

/** Receives anonymous analytics events (sent with navigator.sendBeacon). */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = analyticsBatch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return new NextResponse(null, { status: 204 }); // analytics not connected yet: drop silently

  const { error } = await supabase.from("events").insert(
    parsed.data.map((event) => ({
      anon_id: event.anonId,
      session_id: event.sessionId,
      name: event.name,
      props: event.props ?? {},
    })),
  );
  if (error) {
    console.error("analytics insert failed", error.message);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
