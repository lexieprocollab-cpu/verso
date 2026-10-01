import { format } from "@shared/lib/i18n";
import { useState } from "react";
import { useAccess } from "../lib/access";
import { getSupabase } from "../lib/supabase";
import { usePreferences } from "../lib/usePreferences";
import { Body, Button, Card, Field } from "./ui";

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
    </Card>
  );
}
