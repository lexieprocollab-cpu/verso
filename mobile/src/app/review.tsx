import { directionOf, format } from "@shared/lib/i18n";
import type { PhotoWord } from "@shared/lib/photoWords";
import { SPEECH_LANG, lookupGloss } from "@shared/lib/song";
import { isDue, type Grade } from "@shared/lib/srs";
import * as Speech from "expo-speech";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Body, Button, Card, Screen } from "../components/ui";
import { gradeWord, photoWordsStore, reviewsStore, savedWordsStore, wordId, type SavedWord } from "../lib/learner";
import { useSongs } from "../lib/songs";
import { usePreferences } from "../lib/usePreferences";

type ReviewCard = { kind: "song"; id: string; entry: SavedWord } | { kind: "photo"; id: string; word: PhotoWord };

/** Flashcards: the saved words (from songs and photos) that are due, one at a time (spaced repetition). */
export default function Review() {
  const { t } = usePreferences();
  const words = savedWordsStore.useValue();
  const photoWords = photoWordsStore.useValue();
  const reviews = reviewsStore.useValue();
  // The queue is fixed when the session starts, so graded cards don't reshuffle it.
  const [queue] = useState<ReviewCard[]>(() => {
    const now = Date.now();
    return [
      ...words.map((entry): ReviewCard => ({ kind: "song", id: wordId(entry.songId, entry.key), entry })),
      ...photoWords.map((word): ReviewCard => ({ kind: "photo", id: word.id, word })),
    ].filter((card) => isDue(reviews[card.id], now));
  });
  const [index, setIndex] = useState(0);
  const card = queue[index];

  if (!card) {
    return (
      <Screen>
        <Body style={{ fontSize: 20, textAlign: "center", marginTop: 40 }}>
          {words.length + photoWords.length === 0 ? t.words.empty : queue.length ? t.practice.reviewDone : t.practice.reviewNone}
        </Body>
      </Screen>
    );
  }
  return (
    <Screen>
      <Body muted>{format(t.quiz.progress, { n: index + 1, total: queue.length })}</Body>
      {card.kind === "song" ? (
        <Flashcard
          key={card.id}
          entry={card.entry}
          onGrade={(grade) => {
            gradeWord(card.id, grade);
            setIndex(index + 1);
          }}
        />
      ) : (
        <PhotoFlashcard
          key={card.id}
          word={card.word}
          onGrade={(grade) => {
            gradeWord(card.id, grade);
            setIndex(index + 1);
          }}
        />
      )}
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
          <GradeButtons onGrade={onGrade} />
        </>
      ) : (
        <View style={{ alignSelf: "stretch", marginTop: 12 }}>
          <Button label={t.practice.show} onPress={() => setFlipped(true)} />
        </View>
      )}
    </Card>
  );
}

/** A word learned from a photo: the word and its example on the front, meaning and definition on the back. */
function PhotoFlashcard({ word, onGrade }: { word: PhotoWord; onGrade: (grade: Grade) => void }) {
  const { t, colors } = usePreferences();
  const [flipped, setFlipped] = useState(false);
  return (
    <Card style={{ alignItems: "center", padding: 24, gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={() => Speech.speak(word.word, { language: SPEECH_LANG[word.learn], rate: 0.8 })}>
        <Text style={[styles.word, { color: colors.text }]}>📷 {word.word} 🔊</Text>
      </Pressable>
      {word.example ? <Text style={{ color: colors.muted, textAlign: "center" }}>“{word.example}”</Text> : null}
      {flipped ? (
        <>
          <Text style={[styles.meaning, { color: colors.text }]}>{word.meaning}</Text>
          <Text style={{ color: colors.muted, textAlign: "center" }}>{word.definition}</Text>
          <GradeButtons onGrade={onGrade} />
        </>
      ) : (
        <View style={{ alignSelf: "stretch", marginTop: 12 }}>
          <Button label={t.practice.show} onPress={() => setFlipped(true)} />
        </View>
      )}
    </Card>
  );
}

function GradeButtons({ onGrade }: { onGrade: (grade: Grade) => void }) {
  const { t, colors } = usePreferences();
  const grades: [Grade, string, string][] = [
    ["again", t.practice.again, colors.bad],
    ["hard", t.practice.hard, "#d97706"],
    ["good", t.practice.good, colors.good],
    ["easy", t.practice.easy, colors.accent],
  ];
  return (
    <View style={styles.grades}>
      {grades.map(([grade, label, color]) => (
        <Pressable key={grade} accessibilityRole="button" onPress={() => onGrade(grade)} style={[styles.grade, { borderColor: color }]}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  word: { fontSize: 36, fontWeight: "800" },
  meaning: { fontSize: 24, textAlign: "center", marginTop: 8 },
  grades: { flexDirection: "row", gap: 8, alignSelf: "stretch", marginTop: 8 },
  grade: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
});
