import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FAMILY_SEATS } from "../billing";

// Family plans (step 30): the owner shares an invite code; the server checks
// it, the owner's plan and the free seats before adding anyone.

export type FamilyError = "no_family_plan" | "bad_code" | "family_full" | "already_in_family" | "already_subscribed" | "own_family";
export type FamilyResult<T = null> = { ok: true; data: T } | { ok: false; error: FamilyError };

const fail = (error: FamilyError): { ok: false; error: FamilyError } => ({ ok: false, error });

// No 0/O or 1/I, so codes are easy to read aloud.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newInviteCode(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

async function hasFamilyPlan(db: SupabaseClient, owner: string): Promise<boolean> {
  const { data } = await db.from("subscriptions").select("status, plan").eq("user_id", owner).maybeSingle();
  return data?.status === "active" && data.plan === "family";
}

/** The owner's invite code (a new one when `rotate`, e.g. after it was shared too widely). */
export async function familyInvite(db: SupabaseClient, owner: string, rotate: boolean): Promise<FamilyResult<{ code: string }>> {
  if (!(await hasFamilyPlan(db, owner))) return fail("no_family_plan");
  const { data: existing } = await db.from("family_invites").select("code").eq("owner", owner).maybeSingle();
  if (existing && !rotate) return { ok: true, data: { code: existing.code } };
  const code = newInviteCode();
  await db.from("family_invites").upsert({ owner, code, created_at: new Date().toISOString() }, { onConflict: "owner" });
  return { ok: true, data: { code } };
}

export async function joinFamily(db: SupabaseClient, userId: string, code: string): Promise<FamilyResult<{ owner: string }>> {
  const { data: invite } = await db.from("family_invites").select("owner").eq("code", code.trim().toUpperCase()).maybeSingle();
  if (!invite) return fail("bad_code");
  const owner = invite.owner as string;
  if (owner === userId) return fail("own_family");
  if (!(await hasFamilyPlan(db, owner))) return fail("no_family_plan");

  const [{ data: mine }, { data: seat }, { data: members }] = await Promise.all([
    db.from("subscriptions").select("status").eq("user_id", userId).maybeSingle(),
    db.from("family_members").select("owner").eq("member", userId).maybeSingle(),
    db.from("family_members").select("member").eq("owner", owner),
  ]);
  if (mine?.status === "active") return fail("already_subscribed");
  if (seat) return fail("already_in_family");
  if ((members ?? []).length >= FAMILY_SEATS) return fail("family_full");

  await db.from("family_members").insert({ owner, member: userId });
  return { ok: true, data: { owner } };
}
