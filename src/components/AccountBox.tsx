"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { usePreferences } from "./Preferences";

type State = "idle" | "sending" | "sent" | "error";

export function AccountBox({ enabled }: { enabled: boolean }) {
  const { t } = usePreferences();
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");

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

  return (
    <div>
      <p className="mb-2 font-medium">{t.account.title}</p>
      <div className="rounded-xl border border-border bg-surface p-4">
        {!supabase ? (
          <p className="text-muted">{t.account.unavailable}</p>
        ) : userEmail ? (
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
    </div>
  );
}
