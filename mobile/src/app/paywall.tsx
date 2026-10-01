import { Body, Screen, Title } from "../components/ui";
import { AccountBox } from "../components/AccountBox";
import { SubscriptionBox } from "../components/SubscriptionBox";
import { useAccess } from "../lib/access";
import { usePreferences } from "../lib/usePreferences";

/** Shown instead of a song once the 3 free songs are used. */
export default function Paywall() {
  const { t } = usePreferences();
  const access = useAccess();
  return (
    <Screen>
      <Body style={{ fontSize: 56, textAlign: "center" }}>🔒</Body>
      <Title>{t.paywall.title}</Title>
      <Body muted>{t.paywall.body}</Body>
      {!access.session ? <AccountBox /> : null}
      <SubscriptionBox />
    </Screen>
  );
}
