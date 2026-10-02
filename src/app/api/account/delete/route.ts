import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/server/account";
import { getStripe } from "@/lib/server/stripe";
import { getSupabaseAdmin, userFromRequest } from "@/lib/server/supabaseAdmin";

/** Permanently deletes the signed-in learner's account and data. */
export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });

  try {
    const result = await deleteAccount(db, getStripe(), user.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
    return NextResponse.json({
      deleted: true,
      storeSubscription: result.storeSubscription,
    });
  } catch (error) {
    console.error("Account deletion failed", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
