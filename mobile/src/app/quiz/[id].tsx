import { quizFromAi } from "@shared/lib/ai/quizFromAi";
import { format, type UiLanguage } from "@shared/lib/i18n";
import { lineOfWord, lineWords, scramble, tokenize, wordKey, type QuizItem, type Song } from "@shared/lib/song";
import * as Speech from "expo-speech";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AiNotice } from "../../components/AiNotice";
import { TappableText } from "../../components/TappableText";
import { Body, Button, Card, Chip, Row, Screen } from "../../components/ui";
import { WordCard, type Selection } from "../../components/WordCard";
import { useAi } from "../../lib/ai";
import { recordActivity, saveWord } from "../../lib/learner";
import { useSong } from "../../lib/songs";
import { usePreferences, type Colors } from "../../lib/usePreferences";

type Result = { correct: boolean; picked: number | string };
type Level = "easy" | "medium" | "hard";

export default function QuizRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const song = useSong(id);
  const { t } = usePreferences();
  if (!song) return <Body muted>{t.catalog.notFound}</Body>;
  return <Quiz key={song.id} song={song} />;
}

function Quiz({ song }: { song: Song }) {
  const { t, colors, meaningFor } = usePreferences();
  const meaning = meaningFor(song.language);
  const [items, setItems] = useState<QuizItem[]>(song.quiz);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [savedForReview, setSavedForReview] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [level, setLevel] = useState<Level>("easy");
  const generator = useAi("quiz");
  const item = items[index];
  const openWord = (key: string, word: string) => setSelection({ key, word, line: lineOfWord(song, key) ?? 0 });
  const inGlossary = (key: string) => key in song.glossary;

  function restart() {
    setIndex(0);
    setScore(0);
    setResult(null);
    setSavedForReview(false);
    setShowTranslation(false);
  }

  async function newAiQuiz() {
    const lines = song.lines.map((line) => line.text);
    const outcome = await generator.run({ title: song.title, lines, learn: song.language, meaning: meaning ?? "en", level });
    if (outcome.status !== "done") return;
    const generated = quizFromAi(outcome.data, lines, meaning ?? "en");
    if (generated.length < 3) return;
    setItems(generated);
    restart();
  }

  function answer(correct: boolean, picked: number | string, reviewWord?: string) {
    setResult({ correct, picked });
    recordActivity();
    if (correct) setScore(score + 1);
    else if (reviewWord) {
      const key = wordKey(reviewWord);
      saveWord({ key, word: reviewWord, songId: song.id, line: lineOfWord(song, key) ?? 0 });
      setSavedForReview(true);
    }
  }

  function next() {
    setIndex(index + 1);
    setResult(null);
    setSavedForReview(false);
    setShowTranslation(false);
  }

  const aiControls = (
    <Row>
      {(["easy", "medium", "hard"] as const).map((l) => (
        <Chip key={l} label={t.ai[l]} active={level === l} onPress={() => setLevel(l)} />
      ))}
      <Chip label={`✨ ${generator.state.status === "loading" ? t.ai.generating : t.ai.newQuiz}`} onPress={() => void newAiQuiz()} />
    </Row>
  );

  if (!item) {
    return (
      <Screen>
        <Text style={styles.trophy}>{score === items.length ? "🏆" : "🎵"}</Text>
        <Text style={[styles.done, { color: colors.text }]}>{format(t.quiz.done, { score, total: items.length })}</Text>
        <Button label={t.quiz.again} onPress={restart} />
        <Button kind="secondary" label={t.quiz.backToSong} onPress={() => router.back()} />
        {aiControls}
        <AiNotice state={generator.state} />
      </Screen>
    );
  }

  const translation = meaning ? translationOf(song, item, meaning) : undefined;
  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <Body muted>{song.title}</Body>
        <Body muted>{format(t.quiz.progress, { n: index + 1, total: items.length })}</Body>
      </Row>
      {aiControls}
      {generator.state.status === "error" ? <AiNotice state={generator.state} /> : null}
      <View style={[styles.progress, { backgroundColor: colors.border }]}>
        <View style={{ width: `${(index / items.length) * 100}%`, height: 6, backgroundColor: colors.accent, borderRadius: 3 }} />
      </View>

      <Card style={{ gap: 12 }}>
        {item.kind === "fill" || item.kind === "order" ? (
          <Text style={[styles.question, { color: colors.text }]}>{item.kind === "fill" ? t.quiz.chooseWord : t.quiz.orderWords}</Text>
        ) : (
          <Row style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
            <TappableText text={item.question} onWord={openWord} isKnown={inGlossary} style={[styles.question, { color: colors.text, flex: 1 }]} />
            <Pressable accessibilityRole="button" accessibilityLabel={t.player.listen} onPress={() => Speech.speak(item.question, { language: song.speechLang })}>
              <Text style={{ fontSize: 22 }}>🔊</Text>
            </Pressable>
          </Row>
        )}
        {translation ? (
          showTranslation ? (
            <Body muted>{translation}</Body>
          ) : (
            <Text onPress={() => setShowTranslation(true)} style={{ color: colors.accent, fontWeight: "600" }}>
              🌐 {t.quiz.translator}
            </Text>
          )
        ) : null}

        {item.kind === "picture" ? (
          <View style={styles.pictures}>
            {item.choices.map((choice, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={result ? choice.word : `${i + 1}`}
                  disabled={result !== null}
                  onPress={() => answer(Boolean(choice.correct), i, item.choices.find((c) => c.correct)?.word)}
                  style={[styles.picture, choiceStyle(colors, result, i, Boolean(choice.correct))]}
                >
                  <Text style={styles.emoji}>{choice.emoji}</Text>
                </Pressable>
                {result ? <TappableText text={choice.word} onWord={openWord} style={{ color: colors.text, fontSize: 17 }} /> : null}
              </View>
            ))}
          </View>
        ) : null}

        {item.kind === "choice"
          ? item.choices.map((choice, i) => (
              <Pressable key={i} accessibilityRole="button" disabled={result !== null} onPress={() => answer(Boolean(choice.correct), i)} style={[styles.option, choiceStyle(colors, result, i, Boolean(choice.correct))]}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}>{choice.text}</Text>
              </Pressable>
            ))
          : null}

        {item.kind === "fill" ? <Fill song={song} item={item} result={result} onAnswer={answer} onWord={openWord} /> : null}
        {item.kind === "order" ? <Order key={index} song={song} line={item.line} result={result} onAnswer={answer} /> : null}

        {result ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: result.correct ? colors.good : colors.bad, fontWeight: "700", fontSize: 17 }}>{result.correct ? t.quiz.correct : t.quiz.wrong}</Text>
            {savedForReview ? <Body muted>{t.quiz.addedForReview}</Body> : null}
            <Button label={t.quiz.next} onPress={next} />
          </View>
        ) : null}
      </Card>
      {selection ? <WordCard song={song} selection={selection} meaning={meaning} onClose={() => setSelection(null)} /> : null}
    </Screen>
  );
}

function translationOf(song: Song, item: QuizItem, lang: UiLanguage) {
  if (item.kind === "picture" || item.kind === "choice") return item.translations[lang];
  return song.lines[item.line].translations[lang];
}

function choiceStyle(colors: Colors, result: Result | null, index: number, correct: boolean) {
  if (!result) return { borderColor: colors.border, backgroundColor: colors.bg };
  if (correct) return { borderColor: colors.good, backgroundColor: "rgba(34,197,94,0.12)" };
  if (result.picked === index) return { borderColor: colors.bad, backgroundColor: "rgba(239,68,68,0.12)" };
  return { borderColor: colors.border, backgroundColor: colors.bg, opacity: 0.6 };
}

function Fill({
  song,
  item,
  result,
  onAnswer,
  onWord,
}: {
  song: Song;
  item: Extract<QuizItem, { kind: "fill" }>;
  result: Result | null;
  onAnswer: (correct: boolean, picked: number, reviewWord?: string) => void;
  onWord: (key: string, word: string) => void;
}) {
  const { colors } = usePreferences();
  const answerKey = wordKey(item.answer);
  const tokens = tokenize(song.lines[item.line].text);
  const blank = tokens.findIndex((token) => token.isWord && token.key === answerKey);
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 22, lineHeight: 32 }}>
        {tokens.map((token, i) =>
          i === blank ? (
            <Text key={i} style={{ color: result ? colors.good : colors.accent, fontWeight: "800" }}>
              {result ? token.text : " ____ "}
            </Text>
          ) : token.isWord ? (
            <Text key={i} onPress={() => onWord(token.key, token.text)}>
              {token.text}
            </Text>
          ) : (
            token.text
          ),
        )}
      </Text>
      <View style={styles.pictures}>
        {item.options.map((option, i) => (
          <Pressable key={option} accessibilityRole="button" disabled={result !== null} onPress={() => onAnswer(option === item.answer, i, item.answer)} style={[styles.option, { flex: 1, alignItems: "center" }, choiceStyle(colors, result, i, option === item.answer)]}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Order({ song, line, result, onAnswer }: { song: Song; line: number; result: Result | null; onAnswer: (correct: boolean, picked: string) => void }) {
  const { t, colors } = usePreferences();
  const words = lineWords(song.lines[line].text);
  const [pool] = useState(() => scramble(words.map((word, i) => ({ word, id: i }))));
  const [picked, setPicked] = useState<number[]>([]);
  const byId = (id: number) => pool.find((p) => p.id === id)!.word;
  const sentence = picked.map(byId);
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.slots, { borderColor: colors.border }]}>
        {picked.map((id) => (
          <Chip key={id} label={byId(id)} active onPress={() => !result && setPicked(picked.filter((p) => p !== id))} />
        ))}
      </View>
      {result && !result.correct ? <Text style={{ color: colors.good, fontSize: 17, fontWeight: "600" }}>{words.join(" ")}</Text> : null}
      <Row>
        {pool
          .filter((p) => !picked.includes(p.id))
          .map((p) => (
            <Chip key={p.id} label={p.word} onPress={() => !result && setPicked([...picked, p.id])} />
          ))}
      </Row>
      {!result ? (
        <Row style={{ flexWrap: "nowrap" }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t.quiz.check}
              disabled={picked.length !== words.length}
              onPress={() => onAnswer(sentence.every((word, i) => word.toLowerCase() === words[i].toLowerCase()), sentence.join(" "))}
            />
          </View>
          <Button kind="secondary" label={t.quiz.clear} onPress={() => setPicked([])} />
        </Row>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  trophy: { fontSize: 64, textAlign: "center", marginTop: 24 },
  done: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  progress: { height: 6, borderRadius: 3, overflow: "hidden" },
  question: { fontSize: 20, fontWeight: "700" },
  pictures: { flexDirection: "row", gap: 10 },
  picture: { aspectRatio: 1, width: "100%", borderWidth: 2, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 48 },
  option: { borderWidth: 2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  slots: { minHeight: 56, borderWidth: 2, borderStyle: "dashed", borderRadius: 14, padding: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
