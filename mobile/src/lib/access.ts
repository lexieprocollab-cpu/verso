import { isPlan, songAccess, type Plan, type SubscriptionStatus } from "@shared/lib/billing";
import type { Song } from "@shared/lib/song";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { trialStore } from "./learner";
import { getSupabase } from "./supabase";

// Who is signed in, and what they may play: their own subscription (web or
// app store), a seat on a family plan, or the 3-song trial.

export type Access = {
  state: "unavailable" | "loading" | "signed_out" | SubscriptionStatus;
  plan: Plan | null;
  familyOwner: string | null;
  session: Session | null;
};

const INITIAL: Access = { state: "loading", plan: null, familyOwner: null, session: null };
let current: Access = getSupabase() ? INITIAL : { ...INITIAL, state: "unavailable" };
const listeners = new Set<(a: Access) => void>();
let started = false;

async function load(session: Session | null) {
  const db = getSupabase();
  if (!db) return;
  if (!session) return set({ ...INITIAL, state: "signed_out" });
  const { data } = await db.rpc("my_subscription");
  const row = (Array.isArray(data) ? data[0] : data) as { status?: string; plan?: string; family_owner?: string | null } | null;
  set({
    state: (row?.status as SubscriptionStatus | undefined) ?? "trial",
    plan: isPlan(row?.plan) ? row.plan : null,
    familyOwner: row?.family_owner ?? null,
    session,
  });
}

function set(next: Access) {
  current = next;
  listeners.forEach((l) => l(next));
}

function start() {
  if (started) return;
  started = true;
  const db = getSupabase();
  if (!db) return;
  db.auth.getSession().then(({ data }) => load(data.session));
  db.auth.onAuthStateChange((_event, session) => void load(session));
}

/** Re-reads the subscription (after a purchase or a family invite). */
export async function refreshAccess() {
  const db = getSupabase();
  if (db) await load((await db.auth.getSession()).data.session);
}

export function useAccess(): Access {
  const [value, setValue] = useState(current);
  useEffect(() => {
    start();
    listeners.add(setValue);
    setValue(current);
    return () => void listeners.delete(setValue);
  }, []);
  return value;
}

/** Subscriber extras (offline songs, charts). Open in the demo without a database. */
export function isPremium(access: Access): boolean {
  return access.state === "active" || access.state === "unavailable";
}

export function useSongAccess(song: Song | undefined) {
  const access = useAccess();
  const trial = trialStore.useValue();
  if (!song) return { allowed: false as const };
  return songAccess(song.id, { free: Boolean(song.free), subscribed: access.state === "active", trialSongs: trial });
}
