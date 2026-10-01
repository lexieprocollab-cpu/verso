import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { MAX_MESSAGE_LENGTH } from "@/lib/rooms/rules";
import {
  findBuddies,
  isModerator,
  moderationQueue,
  reportDirect,
  reportMessage,
  resolveReport,
  sendDirect,
  sendMessage,
  voteForEntry,
  type RoomResult,
} from "@/lib/server/rooms";
import { getSupabaseAdmin, userFromRequest } from "@/lib/server/supabaseAdmin";

const schemas = {
  send: z.object({
    songId: z.string().min(1).max(120),
    body: z.string().max(MAX_MESSAGE_LENGTH + 50),
    mode: z.enum(["free", "song"]),
    challenge: z.boolean().default(false),
  }),
  report: z.object({ messageId: z.number().int().positive(), reason: z.string().max(200).optional() }),
  vote: z.object({ messageId: z.number().int().positive() }),
  resolve: z.object({
    messageId: z.number().int().positive(),
    action: z.enum(["restore", "remove"]),
    banDays: z.number().int().min(0).max(365).default(0),
    kind: z.enum(["room", "direct"]).default("room"),
  }),
  dm: z.object({ to: z.string().uuid(), body: z.string().max(MAX_MESSAGE_LENGTH + 50) }),
};

function respond(result: RoomResult<unknown>) {
  if (result.ok) return NextResponse.json(result.data ?? { ok: true });
  const status = result.error === "slow_down" ? 429 : ["too_young", "banned", "not_allowed", "profile_needed", "follow_needed", "blocked"].includes(result.error) ? 403 : 422;
  return NextResponse.json({ error: result.error }, { status });
}

/**
 * POST /api/rooms/{send|report|vote|resolve|dm|dm-report};
 * GET /api/rooms/queue (moderators) and /api/rooms/buddies.
 */
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "rooms_not_configured" }, { status: 503 });
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);

  if (action === "send") {
    const input = schemas.send.safeParse(body);
    if (!input.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    return respond(await sendMessage(db, user.id, input.data));
  }
  if (action === "report") {
    const input = schemas.report.safeParse(body);
    if (!input.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    return respond(await reportMessage(db, user.id, input.data.messageId, input.data.reason));
  }
  if (action === "vote") {
    const input = schemas.vote.safeParse(body);
    if (!input.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    return respond(await voteForEntry(db, user.id, input.data.messageId));
  }
  if (action === "resolve") {
    if (!(await isModerator(db, user.id))) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
    const input = schemas.resolve.safeParse(body);
    if (!input.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    await resolveReport(db, input.data.messageId, input.data.action, input.data.banDays, input.data.kind);
    return NextResponse.json({ ok: true });
  }
  if (action === "dm") {
    const input = schemas.dm.safeParse(body);
    if (!input.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    return respond(await sendDirect(db, user.id, input.data));
  }
  if (action === "dm-report") {
    const input = schemas.report.safeParse(body);
    if (!input.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    return respond(await reportDirect(db, user.id, input.data.messageId, input.data.reason));
  }
  return NextResponse.json({ error: "unknown_action" }, { status: 404 });
}

export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== "queue" && action !== "buddies") return NextResponse.json({ error: "unknown_action" }, { status: 404 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "rooms_not_configured" }, { status: 503 });
  const user = await userFromRequest(request);
  if (action === "buddies") {
    if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
    const result = await findBuddies(db, user.id);
    return result.ok ? NextResponse.json({ items: result.data }) : respond(result);
  }
  if (!user || !(await isModerator(db, user.id))) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  return NextResponse.json({ items: await moderationQueue(db) });
}
