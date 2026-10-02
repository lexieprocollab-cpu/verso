"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { accessToken } from "@/lib/subscription";
import { getSupabase } from "@/lib/supabase";
import { usePreferences } from "./Preferences";

type State = "idle" | "sending" | "sent" | "error";
type DeleteState = "idle" | "confirm" | "deleting" | "failed" | { deleted: true; storeSubscription: boolean };

/** Learner data kept in this browser; removed too when the account is deleted. */
function clearLocalData() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("verso.")) localStorage.removeItem(key);
  } catch {
    // Storage may be blocked; nothing to clear then.
  }
}

export function AccountBox({ enabled }: { enabled: boolean }) {
  const { t } = usePreferences();
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");

  useEffect(() => {
    const supabase = enabled ? getSupabase() : null;
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [enabled]);

  const supabase = enabled ? getSupabase() : null;

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/settings` },
    });
    setState(error ? "error" : "sent");
  }

  async function deleteAccount() {
    if (!supabase) return;
    setDeleteState("deleting");
    try {
      const token = await accessToken();
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) return setDeleteState("failed");
      const { storeSubscription } = (await response.json()) as { storeSubscription?: boolean };
      clearLocalData();
      await supabase.auth.signOut().catch(() => {});
      setDeleteState({ deleted: true, storeSubscription: Boolean(storeSubscription) });
    } catch {
      setDeleteState("failed");
    }
  }

  const deleted = typeof deleteState === "object" ? deleteState : null;

  return (
    <div>
      <p className="mb-2 font-medium">{t.account.title}</p>
      <div className="rounded-xl border border-border bg-surface p-4">
        {deleted ? (
          <div className="space-y-2" role="status">
            <p>{t.account.deleted}</p>
            {deleted.storeSubscription && <p className="text-sm text-muted">{t.account.storeReminder}</p>}
          </div>
        ) : !supabase ? (
          <p className="text-muted">{t.account.unavailable}</p>
        ) : userEmail ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0 truncate">
                {t.account.signedInAs} <strong>{userEmail}</strong>
              </span>
              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm"
              >
                {t.account.signOut}
              </button>
            </div>
            {deleteState === "idle" ? (
              <button type="button" onClick={() => setDeleteState("confirm")} className="text-sm text-red-600 underline">
                {t.account.deleteAccount}
              </button>
            ) : (
              <div className="space-y-3 rounded-lg border border-red-600/40 p-3" role="alertdialog" aria-label={t.account.deleteAccount}>
                <p className="text-sm">{t.account.deleteWarning}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={deleteAccount}
                    disabled={deleteState === "deleting"}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {t.account.deleteConfirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteState("idle")}
                    disabled={deleteState === "deleting"}
                    className="rounded-lg border border-border px-4 py-2 text-sm"
                  >
                    {t.account.cancel}
                  </button>
                </div>
                {deleteState === "failed" && <p className="text-sm text-red-600">{t.account.deleteFailed}</p>}
              </div>
            )}
          </div>
        ) : state === "sent" ? (
          <p>{t.account.linkSent}</p>
        ) : (
          <form onSubmit={sendLink} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.account.emailPlaceholder}
              dir="ltr"
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2"
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {t.account.sendLink}
            </button>
            {state === "error" && <p className="text-sm text-red-600">{t.account.error}</p>}
          </form>
        )}
      </div>
      <p className="mt-2 flex gap-4 text-sm text-muted">
        <Link href="/privacy" className="underline">
          {t.account.privacy}
        </Link>
        <Link href="/terms" className="underline">
          {t.account.terms}
        </Link>
      </p>
    </div>
  );
}
