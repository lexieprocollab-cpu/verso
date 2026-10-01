import { LANGUAGE_NAMES, UI_LANGUAGES } from "@shared/lib/i18n";
import { Pressable, Text } from "react-native";
import { AccountBox } from "../../components/AccountBox";
import { SubscriptionBox } from "../../components/SubscriptionBox";
import { Body, Card, Chip, Row, Screen } from "../../components/ui";
import { API_URL } from "../../lib/config";
import { updatePreferences } from "../../lib/learner";
import { offlineSongsStore, removeOffline } from "../../lib/offline";
import { getSupabase } from "../../lib/supabase";
import { usePreferences } from "../../lib/usePreferences";

/** Settings: account, subscription, languages, offline songs and service status. */
export default function Settings() {
  const { t, colors, lang, speak } = usePreferences();
  const offline = offlineSongsStore.useValue();
  const heading = (text: string) => <Body style={{ fontWeight: "800", fontSize: 18, marginTop: 8 }}>{text}</Body>;
  return (
    <Screen>
      {heading(t.account.title)}
      <AccountBox />
      {heading(t.paywall.plan)}
      <SubscriptionBox />
      {heading(t.interfaceLanguage)}
      <Row>
        {UI_LANGUAGES.map((code) => (
          <Chip key={code} label={LANGUAGE_NAMES[code]} active={lang === code} onPress={() => updatePreferences({ lang: code })} />
        ))}
      </Row>
      {heading(t.player.iSpeak)}
      <Row>
        {UI_LANGUAGES.map((code) => (
          <Chip key={code} label={LANGUAGE_NAMES[code]} active={(speak ?? lang) === code} onPress={() => updatePreferences({ speak: code })} />
        ))}
      </Row>
      {heading(t.offline.title)}
      <Card>
        {offline.length === 0 ? <Body muted>{t.offline.none}</Body> : null}
        {offline.map(({ song }) => (
          <Row key={song.id} style={{ justifyContent: "space-between" }}>
            <Body>{song.title}</Body>
            <Pressable accessibilityRole="button" onPress={() => removeOffline(song.id)}>
              <Text style={{ color: colors.muted }}>{t.offline.remove}</Text>
            </Pressable>
          </Row>
        ))}
      </Card>
      {heading(t.status.title)}
      <Card>
        <Body>
          {t.status.database}: {getSupabase() ? t.status.connected : t.status.notConfigured}
        </Body>
        <Body>
          {t.status.ai}: {API_URL ? t.status.connected : t.status.notConfigured}
        </Body>
      </Card>
    </Screen>
  );
}
