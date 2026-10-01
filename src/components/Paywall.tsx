"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Plan } from "@/lib/billing";
import { format } from "@/lib/i18n";
import { openBilling, usePlanOffers, type BillingOutcome, type PlanOffer } from "@/lib/subscription";
import { track } from "@/lib/track";
import { usePreferences } from "./Preferences";

/** Shown instead of a song once the free trial is used up. */
export function Paywall({ songId }: { songId: string }) {
  const { t } = usePreferences();

  useEffect(() => {
    track("paywall_shown", { song: songId });
  }, [songId]);

  return (
    <section className="pt-10 text-center">
      <p className="text-6xl" aria-hidden="true">
        🔒
      </p>
      <h1 className="mt-4 text-2xl font-bold">{t.paywall.title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-muted">{t.paywall.body}</p>
      <div className="mx-auto mt-6 max-w-sm text-start">
        <PlanPicker />
      </div>
      <Link href="/" className="mt-4 inline-block text-sm text-muted">
        {t.nav.catalog}
      </Link>
    </section>
  );
}

/** Monthly, yearly and family plans (those with a Stripe price), then the subscribe button. */
export function PlanPicker() {
  const { t, lang } = usePreferences();
  const offers = usePlanOffers();
  const [chosen, setChosen] = useState<Plan | null>(null);
  const plan = chosen ?? (offers?.some((o) => o.plan === "yearly") ? "yearly" : "monthly");
  const price = (offer: PlanOffer) => {
    if (offer.amount === null || !offer.currency) return null;
    const amount = new Intl.NumberFormat(lang, { style: "currency", currency: offer.currency }).format(offer.amount / 100);
    return format(offer.interval === "year" ? t.plans.perYear : t.plans.perMonth, { price: amount });
  };
  const hint: Record<Plan, string> = { monthly: t.plans.monthlyHint, yearly: t.plans.yearlyHint, family: t.plans.familyHint };

  return (
    <div className="space-y-3">
      {offers && offers.length > 1 && (
        <div role="radiogroup" aria-label={t.plans.choose} className="grid gap-2">
          {offers.map((offer) => (
            <button
              key={offer.plan}
              type="button"
              role="radio"
              aria-checked={plan === offer.plan}
              onClick={() => setChosen(offer.plan)}
              className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-start ${plan === offer.plan ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
            >
              <span>
                <span className="block font-semibold">{t.plans[offer.plan]}</span>
                <span className="block text-sm text-muted">{hint[offer.plan]}</span>
              </span>
              {price(offer) && <span className="shrink-0 text-sm font-semibold">{price(offer)}</span>}
            </button>
          ))}
        </div>
      )}
      <SubscribeButton plan={plan} />
      <Link href="/family" className="block text-center text-sm text-muted underline">
        {t.plans.haveCode}
      </Link>
    </div>
  );
}

export function SubscribeButton({ kind = "checkout", plan = "monthly" }: { kind?: "checkout" | "portal"; plan?: Plan }) {
  const { t } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<BillingOutcome | null>(null);

  const message =
    outcome && !outcome.ok
      ? outcome.reason === "not_configured"
        ? t.paywall.notReady
        : outcome.reason === "sign_in_required"
          ? t.paywall.signInFirst
          : t.ai.failed
      : null;

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await openBilling(kind, plan);
          setOutcome(result);
          setBusy(false);
        }}
        className={`w-full rounded-xl px-5 py-3 font-semibold disabled:opacity-60 ${
          kind === "checkout" ? "bg-accent text-white" : "border border-border"
        }`}
      >
        {busy ? t.paywall.redirecting : kind === "checkout" ? t.paywall.subscribe : t.paywall.manage}
      </button>
      {message && (
        <p className="mt-2 text-sm text-muted">
          {message}{" "}
          {outcome && !outcome.ok && outcome.reason === "sign_in_required" && (
            <Link href="/settings" className="font-semibold text-accent">
              {t.settings}
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
