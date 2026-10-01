import { directionOf, format } from "@shared/lib/i18n";
import { lookupGloss } from "@shared/lib/song";
import { isDue, type Grade } from "@shared/lib/srs";
import * as Speech from "expo-speech";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Body, Button, Card, Screen } from "../components/ui";
import { gradeWord, reviewsStore, savedWordsStore, wordId, type SavedWord } from "../lib/learner";
import { useSongs } from "../lib/songs";
import { usePreferences } from "../lib/usePreferences";

/** Flashcards: the saved words that are due, one at a time (spaced repetition). */
export default function Review() {
  const { t } = usePreferences();
  const words = savedWordsStore.useValue();
  const reviews = reviewsStore.useValue();
  // The queue is fixed when the session starts, so graded cards don't reshuffle it.
  const [queue] = useState(() => {
    const now = Date.now();
    return words.filter((w) => isDue(reviews[wordId(w.songId, w.key)], now));
  });
  const [index, setIndex] = useState(0);
  const card = queue[index];

  if (!card) {
    return (
      <Screen>
        <Body style={{ fontSize: 20, textAlign: "center", marginTop: 40 }}>
          {words.length === 0 ? t.words.empty : queue.length ? t.practice.reviewDone : t.practice.reviewNone}
        </Body>
      </Screen>
    );
  }
  return (
    <Screen>
      <Body muted>{format(t.quiz.progress, { n: index + 1, total: queue.length })}</Body>
      <Flashcard
        key={`${card.songId}:${card.key}`}
        entry={card}
        onGrade={(grade) => {
          gradeWord(wordId(card.songId, card.key), grade);
          setIndex(index + 1);
        }}
      />
    </Screen>
  );
}

function Flashcard({ entry, onGrade }: { entry: SavedWord; onGrade: (grade: Grade) => void }) {
  const { t, colors, meaningFor } = usePreferences();
  const song = useSongs().find((s) => s.id === entry.songId);
  const [flipped, setFlipped] = useState(false);
  if (!song) return null;
  const meaning = meaningFor(song.language);
  const gloss = lookupGloss(song, entry.key);
  const text = gloss && meaning ? gloss.meanings[meaning] : undefined;
  const line = song.lines[entry.line];
  const songRtl = directionOf(song.language) === "rtl";
  const grades: [Grade, string, string][] = [
    ["again", t.practice.again, colors.bad],
    ["hard", t.practice.hard, "#d97706"],
    ["good", t.practice.good, colors.good],
    ["easy", t.practice.easy, colors.accent],
  ];
  return (
    <Card style={{ alignItems: "center", padding: 24, gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={() => Speech.speak(entry.word, { language: song.speechLang, rate: 0.8 })}>
        <Text style={[styles.word, { color: colors.text }]}>{entry.word} 🔊</Text>
      </Pressable>
      {line ? <Text style={{ color: colors.muted, textAlign: songRtl ? "right" : "center" }}>“{line.text}”</Text> : null}
      {flipped ? (
        <>
          <Text style={[styles.meaning, { color: colors.text }]}>{text ?? gloss?.lemma ?? entry.note ?? "—"}</Text>
          {gloss?.note ? <Text style={{ color: colors.muted }}>{gloss.note}</Text> : null}
          <View style={styles.grades}>
            {grades.map(([grade, label, color]) => (
              <Pressable key={grade} accessibilityRole="button" onPress={() => onGrade(grade)} style={[styles.grade, { borderColor: color }]}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <View style={{ alignSelf: "stretch", marginTop: 12 }}>
          <Button label={t.practice.show} onPress={() => setFlipped(true)} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  word: { fontSize: 36, fontWeight: "800" },
  meaning: { fontSize: 24, textAlign: "center", marginTop: 8 },
  grades: { flexDirection: "row", gap: 8, alignSelf: "stretch", marginTop: 8 },
  grade: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
});
