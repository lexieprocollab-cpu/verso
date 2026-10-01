import { LANGUAGE_NAMES, format, type UiLanguage } from "@shared/lib/i18n";
import { dayKey, streak, understoodPercent } from "@shared/lib/progress";
import type { Song } from "@shared/lib/song";
import { isKnown } from "@shared/lib/srs";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Body, Chip, Row, Screen } from "../../components/ui";
import { activityStore, knownStore, onboardingStore, reviewsStore, wordId } from "../../lib/learner";
import { offlineSongsStore } from "../../lib/offline";
import { useSongs } from "../../lib/songs";
import { usePreferences } from "../../lib/usePreferences";

/** Catalog: songs by language, with how much of each you understand. */
export default function Catalog() {
  const { t } = usePreferences();
  const songs = useSongs();
  const onboarding = onboardingStore.useValue();
  const days = activityStore.useValue();
  const [filter, setFilter] = useState<UiLanguage | "all">("all");
  const languages = [...new Set(songs.map((s) => s.language))];
  const shown = songs.filter((s) => filter === "all" || s.language === filter);
  const streakDays = streak(days, dayKey(new Date()));

  return (
    <Screen>
      <Body muted>{t.tagline}</Body>
      {streakDays > 0 && <Body style={{ fontWeight: "700" }}>🔥 {format(t.more.streak, { n: streakDays })}</Body>}
      {languages.length > 1 && (
        <Row>
          <Chip label={t.mywords.allLanguages} active={filter === "all"} onPress={() => setFilter("all")} />
          {languages.map((code) => (
            <Chip key={code} label={LANGUAGE_NAMES[code]} active={filter === code} onPress={() => setFilter(code)} />
          ))}
        </Row>
      )}
      {[...shown].sort((a, b) => Number(b.language === onboarding.learn) - Number(a.language === onboarding.learn)).map((song) => (
        <SongCard key={song.id} song={song} />
      ))}
    </Screen>
  );
}

function SongCard({ song }: { song: Song }) {
  const { t, colors } = usePreferences();
  const known = knownStore.useValue();
  const reviews = reviewsStore.useValue();
  const offline = offlineSongsStore.useValue().some((o) => o.song.id === song.id);
  const percent = understoodPercent(song, (key) => known.includes(wordId(song.id, key)) || isKnown(reviews[wordId(song.id, key)]));
  const badges = [LANGUAGE_NAMES[song.language], song.level === "beginner" ? t.catalog.beginner : song.level === "intermediate" ? t.ai.medium : t.ai.hard];
  if (!song.audioUrl && !song.youtubeId) badges.push(t.catalog.demo);
  if (offline) badges.push(`⬇ ${t.offline.badge}`);
  return (
    <Link href={{ pathname: "/song/[id]", params: { id: song.id } }} asChild>
      <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface, borderColor: colors.border }])}>
        <Text style={[styles.title, { color: colors.text }]}>{song.title}</Text>
        <Text style={{ color: colors.muted }}>{song.artist}</Text>
        <View style={styles.badges}>
          {badges.map((badge) => (
            <Text key={badge} style={[styles.badge, { borderColor: colors.border, color: colors.muted }]}>
              {badge}
            </Text>
          ))}
        </View>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.accent }]} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{format(t.more.understood, { n: percent })}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 },
  title: { fontSize: 19, fontWeight: "700" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 12, overflow: "hidden" },
  track: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 4 },
  fill: { height: 6, borderRadius: 3 },
});
