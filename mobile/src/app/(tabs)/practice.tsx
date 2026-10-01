import { format } from "@shared/lib/i18n";
import { isDue } from "@shared/lib/srs";
import { Link, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../components/ui";
import { onboardingStore, reviewsStore, savedWordsStore, wordId } from "../../lib/learner";
import { useSongs } from "../../lib/songs";
import { usePreferences } from "../../lib/usePreferences";

/** Practice: review, quiz, sentence builder, AI tutor and progress. */
export default function Practice() {
  const { t, colors } = usePreferences();
  const words = savedWordsStore.useValue();
  const reviews = reviewsStore.useValue();
  const songs = useSongs();
  const learn = onboardingStore.useValue().learn;
  const [now] = useState(() => Date.now());
  const due = words.filter((w) => isDue(reviews[wordId(w.songId, w.key)], now)).length;
  const quizSong = songs.find((s) => s.language === learn) ?? songs[0];

  const cards: { href: Href; icon: string; title: string; detail: string }[] = [
    { href: "/review", icon: "🃏", title: t.practice.review, detail: words.length === 0 ? t.words.empty : due > 0 ? format(t.practice.reviewDue, { n: due }) : t.practice.reviewNone },
    { href: { pathname: "/quiz/[id]", params: { id: quizSong?.id ?? "" } }, icon: "🎯", title: t.practice.quiz, detail: quizSong?.title ?? "" },
    { href: "/sentence", icon: "🧩", title: t.practice.sentence, detail: t.sentence.hint },
    { href: "/tutor", icon: "💬", title: t.tutor.title, detail: t.tutor.hint },
    { href: "/progress", icon: "📈", title: t.stats.open, detail: t.stats.openHint },
  ];

  return (
    <Screen>
      {cards.map((card) => (
        <Link key={card.title} href={card.href} asChild>
          <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface, borderColor: colors.border }])}>
            <Text style={styles.icon}>{card.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>{card.title}</Text>
              <Text style={{ color: colors.muted }}>{card.detail}</Text>
            </View>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 16, padding: 16 },
  icon: { fontSize: 34 },
  title: { fontSize: 18, fontWeight: "700" },
});
