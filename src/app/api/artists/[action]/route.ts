import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { artistProfileSchema, songSubmissionSchema } from "@/lib/artists";
import { createAudioUpload, pendingSongs, reviewSong, saveArtist, submitSong, type ArtistResult } from "@/lib/server/artists";
import { isModerator } from "@/lib/server/rooms";
import { getSupabaseAdmin, userFromRequest } from "@/lib/server/supabaseAdmin";

const uploadSchema = z.object({ contentType: z.string().max(60), size: z.number().int().positive() });
const reviewSchema = z.object({ songId: z.string().min(1).max(120), approve: z.boolean(), note: z.string().max(500).default("") });

function respond(result: ArtistResult<unknown>) {
  if (result.ok) return NextResponse.json(result.data ?? { ok: true });
  const status = result.error === "slug_taken" ? 409 : result.error === "not_allowed" || result.error === "artist_needed" ? 403 : 422;
  return NextResponse.json({ error: result.error }, { status });
}

async function context(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return { error: NextResponse.json({ error: "not_configured" }, { status: 503 }) } as const;
  const user = await userFromRequest(request);
  if (!user) return { error: NextResponse.json({ error: "sign_in_required" }, { status: 401 }) } as const;
  return { db, user } as const;
}

const badRequest = () => NextResponse.json({ error: "bad_request" }, { status: 400 });

/** POST /api/artists/{profile|upload|submit|review}; GET /api/artists/review (moderators). */
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const ctx = await context(request);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;
  const body: unknown = await request.json().catch(() => null);

  switch (action) {
    case "profile": {
      const input = artistProfileSchema.safeParse(body);
      return input.success ? respond(await saveArtist(db, user.id, input.data)) : badRequest();
    }
    case "upload": {
      const input = uploadSchema.safeParse(body);
      return input.success ? respond(await createAudioUpload(db, user.id, input.data)) : badRequest();
    }
    case "submit": {
      const input = songSubmissionSchema.safeParse(body);
      return input.success ? respond(await submitSong(db, user.id, input.data)) : badRequest();
    }
    case "review": {
      if (!(await isModerator(db, user.id))) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
      const input = reviewSchema.safeParse(body);
      if (!input.success) return badRequest();
      await reviewSong(db, input.data.songId, input.data.approve, input.data.note);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 404 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== "review") return NextResponse.json({ error: "unknown_action" }, { status: 404 });
  const ctx = await context(request);
  if ("error" in ctx) return ctx.error;
  if (!(await isModerator(ctx.db, ctx.user.id))) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  return NextResponse.json({ items: await pendingSongs(ctx.db) });
}
