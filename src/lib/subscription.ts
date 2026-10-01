"use client";

import { useEffect, useState } from "react";
import { isPlan, type Plan, type SubscriptionStatus } from "./billing";
import { getSupabase } from "./supabase";
import { track } from "./track";

export type SubscriptionState = "unavailable" | "signed_out" | "loading" | SubscriptionStatus;

export type SubscriptionDetails = {
  state: SubscriptionState;
  plan: Plan | null;
  /** Set when access comes from someone else's family plan. */
  familyOwner: string | null;
  userId: string | null;
};

const INITIAL: SubscriptionDetails = { state: "loading", plan: null, familyOwner: null, userId: null };

/**
 * The signed-in learner's access, from the database: their own subscription,
 * or a seat on a family plan (the my_subscription() function checks both).
 */
export function useSubscriptionDetails(): SubscriptionDetails {
  const [details, setDetails] = useState<SubscriptionDetails>(() => (getSupabase() ? INITIAL : { ...INITIAL, state: "unavailable" }));

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    const load = async (userId: string | undefined) => {
      if (!userId) return !cancelled && setDetails({ ...INITIAL, state: "signed_out" });
      const { data } = await supabase.rpc("my_subscription");
      const row = (Array.isArray(data) ? data[0] : data) as { status?: string; plan?: string; family_owner?: string | null } | null;
      if (cancelled) return;
      setDetails({
        state: (row?.status as SubscriptionStatus | undefined) ?? "trial",
        plan: isPlan(row?.plan) ? row.plan : null,
        familyOwner: row?.family_owner ?? null,
        userId,
      });
    };
    supabase.auth.getSession().then(({ data }) => load(data.session?.user.id));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => void load(session?.user.id));
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return details;
}

export function useSubscription(): SubscriptionState {
  return useSubscriptionDetails().state;
}

/** Subscriber-only extras (offline songs, advanced stats). In the demo without a database, everything is open. */
export function usePremium(): boolean {
  const state = useSubscription();
  return state === "active" || state === "unavailable";
}

export async function accessToken(): Promise<string | null> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ?? null;
}

export type BillingOutcome = { ok: true } | { ok: false; reason: "not_configured" | "sign_in_required" | "failed" };

/** Sends the learner to Stripe Checkout for `plan` (or to the customer portal). */
export async function openBilling(kind: "checkout" | "portal", plan: Plan = "monthly"): Promise<BillingOutcome> {
  if (!getSupabase()) return { ok: false, reason: "not_configured" };
  const token = await accessToken();
  if (!token) return { ok: false, reason: "sign_in_required" };
  if (kind === "checkout") track("checkout_started");
  try {
    const response = await fetch(`/api/billing/${kind}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(kind === "checkout" ? { plan } : {}),
    });
    if (response.status === 503) return { ok: false, reason: "not_configured" };
    if (response.status === 401) return { ok: false, reason: "sign_in_required" };
    const { url } = (await response.json()) as { url?: string };
    if (!response.ok || !url) return { ok: false, reason: "failed" };
    window.location.assign(url);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Records a trial song in the database too, when signed in (the database enforces the 3-song limit). */
export async function recordTrialSongOnServer(songId: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (userId) await supabase.from("trial_songs").insert({ user_id: userId, song_id: songId });
}

export type PlanOffer = { plan: Plan; amount: number | null; currency: string; interval: string | null };

/** Plans on offer with Stripe prices; empty until billing is configured. */
export function usePlanOffers(): PlanOffer[] | null {
  const [offers, setOffers] = useState<PlanOffer[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/plans")
      .then((response) => (response.ok ? response.json() : { plans: [] }))
      .then((body: { plans: PlanOffer[] }) => !cancelled && setOffers(body.plans))
      .catch(() => !cancelled && setOffers([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return offers;
}

async function familyCall<T>(action: "invite" | "join", body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "sign_in_required" };
  try {
    const response = await fetch(`/api/family/${action}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => null);
    return response.ok ? { ok: true, data: data as T } : { ok: false, error: (data as { error?: string } | null)?.error ?? "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export const familyInvite = (rotate: boolean) => familyCall<{ code: string }>("invite", { rotate });
export const joinFamily = (code: string) => familyCall<{ owner: string }>("join", { code });
