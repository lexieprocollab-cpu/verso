import { directionOf } from "@shared/lib/i18n";
import * as Speech from "expo-speech";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { AiNotice } from "../components/AiNotice";
import { Body, Button, Card, Chip, Field, Row, Screen } from "../components/ui";
import { useAi } from "../lib/ai";
import { recordActivity, savedWordsStore } from "../lib/learner";
import { useSongs } from "../lib/songs";
import { usePreferences } from "../lib/usePreferences";

/** Build a sentence from saved words; the AI checks it, or writes one to translate. */
export default function SentenceBuilder() {
  const { t, colors, meaningFor } = usePreferences();
  const allSaved = savedWordsStore.useValue();
  const songs = useSongs();
  // Practice the language of the most recently saved word.
  const song = songs.find((s) => s.id === allSaved[0]?.songId) ?? songs[songs.length - 1];
  const meaning = meaningFor(song.language) ?? "en";
  const sameLanguage = new Set(songs.filter((s) => s.language === song.language).map((s) => s.id));
  const bank = [...new Set(allSaved.filter((w) => sameLanguage.has(w.songId)).map((w) => w.word.toLowerCase()))];
  const [sentence, setSentence] = useState("");
  const [showTranslation, setShowTranslation] = useState(false);
  const check = useAi("check");
  const make = useAi("sentence");
  const learnRtl = directionOf(song.language) === "rtl";

  return (
    <Screen>
      <Body muted>{t.sentence.hint}</Body>
      {bank.length === 0 ? (
        <Card>
          <Body muted>{t.words.empty}</Body>
        </Card>
      ) : (
        <Row>
          {bank.map((word) => (
            <Chip
              key={word}
              label={word}
              onPress={() => {
                setSentence((current) => (current.trim() ? `${current.trim()} ${word}` : word));
                check.reset();
              }}
            />
          ))}
        </Row>
      )}
      <Field
        value={sentence}
        onChangeText={(text) => {
          setSentence(text);
          check.reset();
        }}
        placeholder={t.sentence.placeholder}
        multiline
        style={{ minHeight: 90, fontSize: 20, textAlign: learnRtl ? "right" : "left" }}
      />
      <Button
        label={`✨ ${t.sentence.check}`}
        disabled={!sentence.trim()}
        busy={check.state.status === "loading"}
        onPress={() => {
          recordActivity();
          void check.run({ sentence: sentence.trim(), words: bank, learn: song.language, meaning });
        }}
      />
      <AiNotice state={check.state} />
      {check.state.status === "done" ? (
        <Card>
          <Text style={{ color: check.state.data.is_correct ? colors.good : "#d97706", fontWeight: "700" }}>{check.state.data.is_correct ? t.sentence.correct : t.sentence.fixed}</Text>
          {!check.state.data.is_correct ? <Text style={{ color: colors.text, fontSize: 20 }}>{check.state.data.corrected}</Text> : null}
          <Body muted>{check.state.data.translation}</Body>
          <Body>{check.state.data.explanation}</Body>
        </Card>
      ) : null}
      <Button
        kind="secondary"
        label={`✨ ${t.sentence.makeOne}`}
        disabled={bank.length === 0}
        busy={make.state.status === "loading"}
        onPress={() => {
          setShowTranslation(false);
          void make.run({ words: bank, learn: song.language, meaning });
        }}
      />
      {make.state.status === "done" ? (
        <Card style={{ alignItems: "center" }}>
          <Pressable accessibilityRole="button" onPress={() => make.state.status === "done" && Speech.speak(make.state.data.sentence, { language: song.speechLang })}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{make.state.data.sentence} 🔊</Text>
          </Pressable>
          {showTranslation ? (
            <Body muted>{make.state.data.translation}</Body>
          ) : (
            <Text onPress={() => setShowTranslation(true)} style={{ color: colors.accent, fontWeight: "600" }}>
              {t.sentence.reveal}
            </Text>
          )}
        </Card>
      ) : null}
      {make.state.status === "error" ? <AiNotice state={make.state} /> : null}
    </Screen>
  );
}
