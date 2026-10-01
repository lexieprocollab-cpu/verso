"use client";

import { useState } from "react";
import { FAMILY_SEATS, TRIAL_SONGS } from "@/lib/billing";
import { format } from "@/lib/i18n";
import { trialSongsStore } from "@/lib/learnerStores";
import { familyInvite, useSubscriptionDetails } from "@/lib/subscription";
import { getSupabase } from "@/lib/supabase";
import { PlanPicker, SubscribeButton } from "./Paywall";
import { usePreferences } from "./Preferences";
import { useLive } from "./rooms/useRooms";

export function SubscriptionBox() {
  const { t } = usePreferences();
  const { state, plan, familyOwner, userId } = useSubscriptionDetails();
  const used = Math.min(trialSongsStore.useValue().length, TRIAL_SONGS);

  return (
    <div>
      <p className="mb-2 font-medium">{t.paywall.plan}</p>
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-4">
        {state === "active" && familyOwner ? (
          <FamilyMember userId={userId} />
        ) : state === "active" ? (
          <>
            <p className="font-semibold text-green-600 dark:text-green-400">
              ✓ {t.paywall.active}
              {plan && ` · ${t.plans[plan]}`}
            </p>
            {plan === "family" && userId && <FamilyOwner userId={userId} />}
            <SubscribeButton kind="portal" />
          </>
        ) : (
          <>
            {state === "past_due" && <p className="text-sm text-amber-600">{t.paywall.pastDue}</p>}
            <p className="text-sm text-muted">{format(t.paywall.freeSong, { n: used, total: TRIAL_SONGS })}</p>
            {state === "past_due" ? <SubscribeButton kind="portal" /> : <PlanPicker />}
          </>
        )}
      </div>
    </div>
  );
}

/** The owner shares an invite link and manages who's on the plan. */
function FamilyOwner({ userId }: { userId: string }) {
  const { t } = usePreferences();
  const db = getSupabase();
  const [invite, reloadInvite] = useLive(() => familyInvite(false), null, []);
  const [members, reloadMembers] = useLive(
    async () => ((await db?.from("family_members").select("member, joined_at").eq("owner", userId))?.data ?? []) as { member: string }[],
    null,
    [userId],
  );
  const [copied, setCopied] = useState(false);
  const code = invite?.ok ? invite.data.code : null;
  const link = code && typeof window !== "undefined" ? `${window.location.origin}/family?code=${code}` : "";

  return (
    <div className="space-y-2 rounded-xl bg-accent-soft p-3">
      <p className="font-semibold">{t.plans.familyTitle}</p>
      <p className="text-sm">{format(t.plans.seats, { n: members?.length ?? 0, total: FAMILY_SEATS })}</p>
      {code && (
        <>
          <p className="text-sm">{t.plans.shareLink}</p>
          <p className="font-mono text-lg tracking-widest" data-testid="family-code">
            {code}
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              className="rounded-lg border border-border bg-surface px-3 py-1.5"
              onClick={async () => {
                await navigator.clipboard?.writeText(link).catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? t.plans.copied : t.plans.copy}
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-surface px-3 py-1.5"
              onClick={async () => {
                await familyInvite(true);
                reloadInvite();
              }}
            >
              {t.plans.newCode}
            </button>
          </div>
        </>
      )}
      {members && members.length > 0 && (
        <ul className="space-y-1 text-sm">
          {members.map(({ member }, i) => (
            <li key={member} className="flex items-center justify-between">
              <span>
                {t.plans.member} {i + 1}
              </span>
              <button
                type="button"
                className="text-muted underline"
                onClick={async () => {
                  await db?.from("family_members").delete().eq("owner", userId).eq("member", member);
                  reloadMembers();
                }}
              >
                {t.plans.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FamilyMember({ userId }: { userId: string | null }) {
  const { t } = usePreferences();
  return (
    <>
      <p className="font-semibold text-green-600 dark:text-green-400">✓ {t.plans.youAreMember}</p>
      <button
        type="button"
        className="w-full rounded-xl border border-border px-5 py-3 font-semibold"
        onClick={async () => {
          if (!userId) return;
          await getSupabase()?.from("family_members").delete().eq("member", userId);
          window.location.reload();
        }}
      >
        {t.plans.leave}
      </button>
    </>
  );
}
