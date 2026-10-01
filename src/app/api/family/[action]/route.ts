import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { familyInvite, joinFamily } from "@/lib/server/family";
import { getSupabaseAdmin, userFromRequest } from "@/lib/server/supabaseAdmin";

const inviteSchema = z.object({ rotate: z.boolean().default(false) });
const joinSchema = z.object({ code: z.string().trim().min(8).max(8) });

/** POST /api/family/invite (owner) and /api/family/join (someone with a code). */
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  const body: unknown = await request.json().catch(() => ({}));

  const result =
    action === "invite"
      ? await (async () => {
          const input = inviteSchema.safeParse(body);
          return input.success ? familyInvite(db, user.id, input.data.rotate) : null;
        })()
      : action === "join"
        ? await (async () => {
            const input = joinSchema.safeParse(body);
            return input.success ? joinFamily(db, user.id, input.data.code) : null;
          })()
        : undefined;
  if (result === undefined) return NextResponse.json({ error: "unknown_action" }, { status: 404 });
  if (result === null) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (result.ok) return NextResponse.json(result.data);
  return NextResponse.json({ error: result.error }, { status: result.error === "bad_code" ? 404 : 409 });
}
