import { LANGUAGE_NAMES, format, aiFailureText } from "@shared/lib/i18n";
import type { DirectMessage, OwnProfile, RoomsBackend } from "@shared/lib/rooms/backend";
import { checkMessage } from "@shared/lib/rooms/rules";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { ProfileGate } from "../../components/ProfileGate";
import { Body, Button, Chip, Field, Notice, Row, Screen } from "../../components/ui";
import { callAi } from "../../lib/ai";
import { roomErrorText, useLive } from "../../lib/rooms";
import { usePreferences } from "../../lib/usePreferences";

/** A private conversation: Translate, Report, and Follow (a minor must follow an adult to write). */
export default function DirectChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Screen>{id ? <ProfileGate>{(rooms, me) => <DirectChat rooms={rooms} me={me} otherId={id} />}</ProfileGate> : null}</Screen>;
}

function DirectChat({ rooms, me, otherId }: { rooms: RoomsBackend; me: OwnProfile; otherId: string }) {
  const { t, lang, colors } = usePreferences();
  const [messages] = useLive(() => rooms.directMessages(otherId), (onChange) => rooms.subscribeDirect(onChange), [rooms, otherId]);
  const [people] = useLive(() => rooms.profiles([otherId]), null, [rooms, otherId]);
  const [following, reloadFollowing] = useLive(() => rooms.following(), null, [rooms]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const other = people?.[otherId];
  const isFollowing = (following ?? []).includes(otherId);
  const problem = checkMessage(text, "free", new Set());

  async function send() {
    if (problem) return;
    const outcome = await rooms.sendDirect(otherId, text);
    if (outcome.ok) {
      setText("");
      setError(null);
    } else setError(roomErrorText(t, outcome.error));
  }

  async function translate(message: DirectMessage) {
    const from = message.from === me.id ? (me.learning[0] ?? lang) : (other?.speaks ?? lang);
    if (from === lang) return;
    setTranslations((all) => ({ ...all, [message.id]: t.ai.loading }));
    const outcome = await callAi("translate", { lines: [message.body], learn: from, target: lang });
    setTranslations((all) => ({ ...all, [message.id]: outcome.ok ? (outcome.data.translations[0] ?? "") : aiFailureText(t, outcome.reason) }));
  }

  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
            {other?.avatar ?? "🎧"} {other?.name ?? "…"}
          </Text>
          {other?.speaks ? <Body muted>{format(t.buddies.speaks, { lang: LANGUAGE_NAMES[other.speaks] })}</Body> : null}
        </View>
        <Chip
          label={isFollowing ? t.rooms.following : t.rooms.follow}
          active={isFollowing}
          onPress={async () => {
            await rooms.setFollowing(otherId, !isFollowing);
            reloadFollowing();
          }}
        />
      </Row>
      {notice ? <Notice>{notice}</Notice> : null}
      {messages && messages.length === 0 ? <Body muted style={{ textAlign: "center" }}>{t.buddies.sayHello}</Body> : null}
      {(messages ?? []).map((m) => {
        const mine = m.from === me.id;
        return (
          <View key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%", backgroundColor: mine ? colors.accentSoft : colors.surface, borderRadius: 16, padding: 12, gap: 4 }}>
            <Text style={{ color: colors.text, fontSize: 17 }}>{m.body}</Text>
            {translations[m.id] ? <Text style={{ color: colors.muted }}>{translations[m.id]}</Text> : null}
            <Row>
              <Text onPress={() => void translate(m)} style={{ color: colors.muted }}>
                {t.rooms.translate}
              </Text>
              {!mine ? (
                <Text
                  onPress={async () => {
                    const outcome = await rooms.reportDirect(m.id);
                    setNotice(outcome.ok ? t.rooms.reported : roomErrorText(t, outcome.error));
                  }}
                  style={{ color: colors.muted }}
                >
                  {t.rooms.report}
                </Text>
              ) : null}
            </Row>
          </View>
        );
      })}
      <Field value={text} onChangeText={setText} placeholder={t.rooms.placeholder} maxLength={300} accessibilityLabel={t.rooms.placeholder} />
      {problem && problem !== "empty" ? <Text style={{ color: colors.bad }}>{roomErrorText(t, problem)}</Text> : null}
      {error ? <Text style={{ color: colors.bad }}>{error}</Text> : null}
      <Button label={t.rooms.send} disabled={Boolean(problem)} onPress={() => void send()} />
    </View>
  );
}
