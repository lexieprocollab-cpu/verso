"use client";

import Link from "next/link";
import { useState } from "react";
import { joinFamily, useSubscription } from "@/lib/subscription";
import { usePreferences } from "./Preferences";

type ErrorKey = "badCode" | "familyFull" | "alreadyInFamily" | "alreadySubscribed" | "ownFamily" | "noFamilyPlan";
const ERROR_KEY: Record<string, ErrorKey> = {
  bad_code: "badCode",
  family_full: "familyFull",
  already_in_family: "alreadyInFamily",
  already_subscribed: "alreadySubscribed",
  own_family: "ownFamily",
  no_family_plan: "noFamilyPlan",
};

/** Joining someone's family plan with the code they shared. */
export function JoinFamily({ initialCode }: { initialCode: string }) {
  const { t } = usePreferences();
  const subscription = useSubscription();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    const outcome = await joinFamily(code);
    setBusy(false);
    if (outcome.ok) return setMessage({ ok: true, text: t.plans.joined });
    const key = ERROR_KEY[outcome.error];
    setMessage({ ok: false, text: key ? t.plans[key] : outcome.error === "sign_in_required" ? t.paywall.signInFirst : t.ai.failed });
  }

  return (
    <section className="mx-auto max-w-sm space-y-4 pt-8 text-center">
      <p className="text-5xl" aria-hidden>
        👨‍👩‍👧
      </p>
      <h1 className="text-2xl font-bold">{t.plans.joinTitle}</h1>
      <p className="text-muted">{t.plans.joinIntro}</p>
      {subscription === "unavailable" ? (
        <p className="text-muted">{t.paywall.notReady}</p>
      ) : subscription === "signed_out" ? (
        <Link href="/settings" className="inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
          {t.paywall.signInFirst}
        </Link>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            placeholder={t.plans.codePlaceholder}
            aria-label={t.plans.codePlaceholder}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-center font-mono text-xl tracking-widest"
          />
          <button type="submit" disabled={code.length !== 8 || busy} className="w-full rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-50">
            {t.plans.join}
          </button>
        </form>
      )}
      {message && (
        <p role="status" className={message.ok ? "font-semibold text-green-600" : "text-red-600"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
