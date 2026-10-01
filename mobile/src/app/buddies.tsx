import { LANGUAGE_NAMES, format } from "@shared/lib/i18n";
import type { Buddy, OwnProfile, RoomsBackend } from "@shared/lib/rooms/backend";
import { Link } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ProfileGate } from "../components/ProfileGate";
import { Body, Card, Screen } from "../components/ui";
import { roomErrorText, useLive } from "../lib/rooms";
import { usePreferences } from "../lib/usePreferences";

/** Language buddies (best matches first) and your conversations. */
export default function Buddies() {
  const { t } = usePreferences();
  return (
    <Screen>
      <Body muted>{t.buddies.intro}</Body>
      <ProfileGate>{(rooms, me) => <BuddiesBody rooms={rooms} me={me} />}</ProfileGate>
    </Screen>
  );
}

function BuddiesBody({ rooms, me }: { rooms: RoomsBackend; me: OwnProfile }) {
  const { t, colors } = usePreferences();
  const [found] = useLive(() => rooms.buddies(), null, [rooms]);
  const [conversations] = useLive(() => rooms.conversations(), (onChange) => rooms.subscribeDirect(onChange), [rooms]);
  const others = useMemo(() => (conversations ?? []).map((c) => c.other).sort(), [conversations]);
  const [people] = useLive(() => rooms.profiles(others), null, [rooms, others.join(",")]);
  return (
    <View style={{ gap: 10 }}>
      {conversations && conversations.length > 0 ? (
        <>
          <Body style={{ fontWeight: "800", fontSize: 18 }}>{t.buddies.conversations}</Body>
          {conversations.map(({ other, last }) => (
            <Link key={other} href={{ pathname: "/dm/[id]", params: { id: other } }} asChild>
              <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.row, { backgroundColor: colors.surface, borderColor: colors.border }])}>
                <Text style={{ fontSize: 26 }}>{people?.[other]?.avatar ?? "🎧"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{people?.[other]?.name ?? "…"}</Text>
                  <Text style={{ color: colors.muted }} numberOfLines={1}>
                    {last.from === me.id ? `${t.rooms.you}: ` : ""}
                    {last.body}
                  </Text>
                </View>
              </Pressable>
            </Link>
          ))}
        </>
      ) : null}
      {found === undefined ? null : !found.ok ? (
        <Body muted>{roomErrorText(t, found.error)}</Body>
      ) : found.buddies.length === 0 ? (
        <Card>
          <Body muted>{t.buddies.none}</Body>
        </Card>
      ) : (
        found.buddies.map((buddy) => <BuddyRow key={buddy.id} buddy={buddy} />)
      )}
    </View>
  );
}

function BuddyRow({ buddy }: { buddy: Buddy }) {
  const { t, colors } = usePreferences();
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text style={{ fontSize: 30 }}>{buddy.avatar}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
          {buddy.name}
          {buddy.mutual ? <Text style={{ color: colors.accent }}> · {t.buddies.perfect}</Text> : null}
        </Text>
        {buddy.speaks ? <Text style={{ color: colors.muted }}>{format(t.buddies.speaks, { lang: LANGUAGE_NAMES[buddy.speaks] })}</Text> : null}
        {buddy.learning.length ? <Text style={{ color: colors.muted }}>{format(t.buddies.learning, { langs: buddy.learning.map((l) => LANGUAGE_NAMES[l]).join(", ") })}</Text> : null}
      </View>
      <Link href={{ pathname: "/dm/[id]", params: { id: buddy.id } }} style={[styles.message, { backgroundColor: colors.accent }]}>
        {t.buddies.message}
      </Link>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  message: { color: "#fff", fontWeight: "700", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, overflow: "hidden" },
});
