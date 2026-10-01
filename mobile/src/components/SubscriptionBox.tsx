import { TRIAL_SONGS } from "@shared/lib/billing";
import { format } from "@shared/lib/i18n";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { refreshAccess, useAccess } from "../lib/access";
import { apiPost } from "../lib/account";
import { trialStore } from "../lib/learner";
import { buyPlan, restorePurchases, storePlans, storePurchasesAvailable, type StorePlan } from "../lib/purchases";
import { usePreferences } from "../lib/usePreferences";
import { Body, Button, Card, Field } from "./ui";

const FAMILY_ERRORS: Record<string, "badCode" | "familyFull" | "alreadyInFamily" | "alreadySubscribed" | "ownFamily" | "noFamilyPlan"> = {
  bad_code: "badCode",
  family_full: "familyFull",
  already_in_family: "alreadyInFamily",
  already_subscribed: "alreadySubscribed",
  own_family: "ownFamily",
  no_family_plan: "noFamilyPlan",
};

/** Plan status; app-store subscriptions; restore; joining a family plan with a code. */
export function SubscriptionBox() {
  const { t, colors } = usePreferences();
  const access = useAccess();
  const used = Math.min(trialStore.useValue().length, TRIAL_SONGS);
  const userId = access.session?.user.id ?? null;
  const [plans, setPlans] = useState<StorePlan[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || access.state === "active") return;
    let live = true;
    storePlans(userId)
      .then((found) => live && setPlans(found))
      .catch(() => live && setPlans([]));
    return () => {
      live = false;
    };
  }, [userId, access.state]);

  if (access.state === "unavailable") return <Body muted>{t.paywall.notReady}</Body>;
  if (access.state === "signed_out" || !userId) return <Body muted>{t.paywall.signInFirst}</Body>;

  async function joinFamily() {
    setBusy("family");
    const outcome = await apiPost<{ owner: string }>("/api/family/join", { code });
    setBusy(null);
    if (outcome.ok) {
      setMessage(t.plans.joined);
      await refreshAccess();
    } else {
      const key = FAMILY_ERRORS[outcome.error];
      setMessage(key ? t.plans[key] : t.ai.failed);
    }
  }

  return (
    <Card>
      {access.state === "active" ? (
        <Text style={{ color: colors.good, fontWeight: "700" }}>
          ✓ {access.familyOwner ? t.plans.youAreMember : t.paywall.active}
          {access.plan && !access.familyOwner ? ` · ${t.plans[access.plan]}` : ""}
        </Text>
      ) : (
        <>
          {access.state === "past_due" ? <Text style={{ color: "#d97706" }}>{t.paywall.pastDue}</Text> : null}
          <Body muted>{format(t.paywall.freeSong, { n: used, total: TRIAL_SONGS })}</Body>
          {storePurchasesAvailable() && plans.length > 0 ? (
            plans.map((plan) => (
              <Button
                key={plan.id}
                label={`${plan.title} · ${plan.price}`}
                busy={busy === plan.id}
                onPress={async () => {
                  setBusy(plan.id);
                  if (await buyPlan(userId, plan)) await refreshAccess();
                  setBusy(null);
                }}
              />
            ))
          ) : (
            <Body muted>{t.mobile.storeSoon}</Body>
          )}
          {storePurchasesAvailable() ? (
            <Button
              kind="secondary"
              label={t.mobile.restore}
              busy={busy === "restore"}
              onPress={async () => {
                setBusy("restore");
                await restorePurchases(userId).catch(() => {});
                await refreshAccess();
                setBusy(null);
              }}
            />
          ) : null}
          <Button kind="secondary" label={t.mobile.refresh} onPress={() => void refreshAccess()} />
          <Body style={{ fontWeight: "700", marginTop: 6 }}>{t.plans.haveCode}</Body>
          <Field value={code} onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder={t.plans.codePlaceholder} autoCapitalize="characters" />
          <Button kind="secondary" label={t.plans.join} disabled={code.length !== 8} busy={busy === "family"} onPress={() => void joinFamily()} />
        </>
      )}
      {message ? <Body>{message}</Body> : null}
    </Card>
  );
}
