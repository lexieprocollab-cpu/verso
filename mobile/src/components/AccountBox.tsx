import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "@shared/lib/i18n";
import { useState } from "react";
import { Linking, Text } from "react-native";
import { useAccess } from "../lib/access";
import { API_URL } from "../lib/config";
import { accessToken, getSupabase } from "../lib/supabase";
import { usePreferences } from "../lib/usePreferences";
import { Body, Button, Card, Field } from "./ui";

/** Learner data kept on this phone; removed too when the account is deleted. */
async function clearLocalData() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith("verso."));
  await AsyncStorage.multiRemove(keys);
}

/** Privacy policy and terms live on the website. */
function LegalLinks() {
  const { t, colors } = usePreferences();
  if (!API_URL) return null;
  return (
    <Text style={{ color: colors.muted }}>
      <Text accessibilityRole="link" style={{ textDecorationLine: "underline" }} onPress={() => void Linking.openURL(`${API_URL}/privacy`)}>
        {t.account.privacy}
      </Text>
      {"   "}
      <Text accessibilityRole="link" style={{ textDecorationLine: "underline" }} onPress={() => void Linking.openURL(`${API_URL}/terms`)}>
        {t.account.terms}
      </Text>
    </Text>
  );
}

type DeleteState = "idle" | "confirm" | "deleting" | "failed" | { deleted: true; storeSubscription: boolean };

/** Sign in with a 6-digit code sent by email (the same account as on the website). */
export function AccountBox() {
  const { t } = usePreferences();
  const access = useAccess();
  const db = getSupabase();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");

  async function deleteAccount() {
    setDeleteState("deleting");
    try {
      const token = await accessToken();
      const response = await fetch(`${API_URL}/api/account/delete`, {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) return setDeleteState("failed");
      const { storeSubscription } = (await response.json()) as { storeSubscription?: boolean };
      await clearLocalData().catch(() => {});
      await db?.auth.signOut().catch(() => {});
      setDeleteState({ deleted: true, storeSubscription: Boolean(storeSubscription) });
    } catch {
      setDeleteState("failed");
    }
  }

  if (typeof deleteState === "object") {
    return (
      <Card>
        <Body>{t.account.deleted}</Body>
        {deleteState.storeSubscription ? <Body muted>{t.account.storeReminder}</Body> : null}
      </Card>
    );
  }

  if (!db) {
    return (
      <Card>
        <Body muted>{t.account.unavailable}</Body>
      </Card>
    );
  }
  if (access.session) {
    return (
      <Card>
        <Body>
          {t.account.signedInAs} {access.session.user.email}
        </Body>
        <Button kind="secondary" label={t.account.signOut} onPress={() => void db.auth.signOut()} />
        {API_URL && deleteState === "idle" ? <Button kind="secondary" label={t.account.deleteAccount} onPress={() => setDeleteState("confirm")} /> : null}
        {deleteState !== "idle" ? (
          <>
            <Body>{t.account.deleteWarning}</Body>
            <Button label={t.account.deleteConfirm} busy={deleteState === "deleting"} onPress={() => void deleteAccount()} />
            <Button kind="secondary" label={t.account.cancel} disabled={deleteState === "deleting"} onPress={() => setDeleteState("idle")} />
            {deleteState === "failed" ? <Body muted>{t.account.deleteFailed}</Body> : null}
          </>
        ) : null}
        <LegalLinks />
      </Card>
    );
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error: failed } = await db!.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (failed) setError(t.account.error);
    else setSent(true);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error: failed } = await db!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (failed) setError(t.mobile.wrongCode);
  }

  return (
    <Card>
      {!sent ? (
        <>
          <Field value={email} onChangeText={setEmail} placeholder={t.account.emailPlaceholder} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Button label={t.mobile.sendCode} busy={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onPress={() => void sendCode()} />
        </>
      ) : (
        <>
          <Body muted>{format(t.mobile.codeSent, { email: email.trim() })}</Body>
          <Field value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 8))} placeholder={t.mobile.code} keyboardType="number-pad" autoComplete="one-time-code" />
          <Button label={t.mobile.verify} busy={busy} disabled={code.length < 6} onPress={() => void verify()} />
        </>
      )}
      {error ? <Body muted>{error}</Body> : null}
      <LegalLinks />
    </Card>
  );
}
