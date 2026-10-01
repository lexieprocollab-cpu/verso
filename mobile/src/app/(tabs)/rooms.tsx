import { format } from "@shared/lib/i18n";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Body, Notice, Screen } from "../../components/ui";
import { getRooms, useLive } from "../../lib/rooms";
import { useSongs } from "../../lib/songs";
import { usePreferences } from "../../lib/usePreferences";

/** Song Rooms: one room per song, and language buddies. */
export default function Rooms() {
  const { t, colors } = usePreferences();
  const songs = useSongs();
  const rooms = getRooms();
  const [counts] = useLive(() => rooms.memberCounts(), null, [rooms]);
  return (
    <Screen>
      <Body muted>{t.rooms.intro}</Body>
      {rooms.kind === "device" ? <Notice>{t.rooms.deviceMode}</Notice> : null}
      <Link href="/buddies" asChild>
        <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.buddies, { backgroundColor: colors.accentSoft }])}>
          <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 16 }}>🤝 {t.buddies.find} →</Text>
        </Pressable>
      </Link>
      {songs.map((song) => (
        <Link key={song.id} href={{ pathname: "/room/[id]", params: { id: song.id } }} asChild>
          <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface, borderColor: colors.border }])}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{song.title}</Text>
              <Text style={{ color: colors.muted }}>
                {song.artist} · {format(t.rooms.members, { n: counts?.[song.id] ?? 0 })}
              </Text>
            </View>
            <Text style={{ color: colors.accent }}>{t.rooms.enter} →</Text>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  buddies: { borderRadius: 16, padding: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 16 },
});
