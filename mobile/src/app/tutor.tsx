import type { TutorResult } from "@shared/lib/ai/schemas";
import { directionOf } from "@shared/lib/i18n";
import { songVocabulary } from "@shared/lib/rooms/rules";
import * as Speech from "expo-speech";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AiNotice } from "../components/AiNotice";
import { Body, Button, Chip, Field, Row, Screen } from "../components/ui";
import { callAi } from "../lib/ai";
import { recordActivity, savedWordsStore } from "../lib/learner";
import { useSongs } from "../lib/songs";
import { usePreferences } from "../lib/usePreferences";

type Level = "easy" | "medium" | "hard";
type Turn = { role: "tutor"; text: string; translation: string } | { role: "learner"; text: string; corrected?: string; explanation?: string };

/** A conversation partner that talks using a song's words and your saved words. */
export default function Tutor() {
  const { t, colors, meaningFor } = usePreferences();
  const songs = useSongs();
  const saved = savedWordsStore.useValue();
  const [songId, setSongId] = useState(songs[0]?.id);
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const meaning = meaningFor(song.language) ?? (song.language === "en" ? "fr" : "en");
  const [level, setLevel] = useState<Level>("easy");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"not_configured" | "declined" | "failed" | null>(null);
  const [shown, setShown] = useState<ReadonlySet<number>>(new Set());
  const rtl = directionOf(song.language) === "rtl";

  const words = useMemo(() => {
    const sameLanguage = new Set(songs.filter((s) => s.language === song.language).map((s) => s.id));
    const mine = saved.filter((w) => sameLanguage.has(w.songId)).map((w) => w.word.toLowerCase());
    return [...new Set([...mine, ...songVocabulary(song)])].slice(0, 120);
  }, [songs, saved, song]);

  async function ask(history: Turn[]) {
    setBusy(true);
    setError(null);
    const outcome = await callAi("tutor", { learn: song.language, meaning, level, song: song.title, words, history: history.slice(-30).map((turn) => ({ role: turn.role, text: turn.text })) });
    setBusy(false);
    if (!outcome.ok) return setError(outcome.reason);
    const answer: TutorResult = outcome.data;
    const next = [...history];
    const last = next.at(-1);
    if (last?.role === "learner" && answer.has_mistake && answer.corrected.trim()) next[next.length - 1] = { ...last, corrected: answer.corrected, explanation: answer.explanation };
    setTurns([...next, { role: "tutor", text: answer.reply, translation: answer.translation }]);
  }

  function send() {
    const message = text.trim();
    if (!message || busy) return;
    const history: Turn[] = [...turns, { role: "learner", text: message }];
    setTurns(history);
    setText("");
    recordActivity();
    void ask(history);
  }

  return (
    <Screen>
      <Body muted>{t.tutor.words}</Body>
      <Body style={{ fontWeight: "700" }}>{t.tutor.song}</Body>
      <Row>
        {songs.map((s) => (
          <Chip
            key={s.id}
            label={s.title}
            active={s.id === song.id}
            onPress={() => {
              setSongId(s.id);
              setTurns([]);
            }}
          />
        ))}
      </Row>
      <Row>
        {(["easy", "medium", "hard"] as const).map((l) => (
          <Chip key={l} label={t.ai[l]} active={level === l} onPress={() => setLevel(l)} />
        ))}
      </Row>
      {turns.length === 0 ? <Button label={t.tutor.start} busy={busy} onPress={() => void ask([])} /> : null}
      {turns.map((turn, i) =>
        turn.role === "tutor" ? (
          <View key={i} style={[styles.bubble, { backgroundColor: colors.surface, alignSelf: "flex-start" }]}>
            <Text style={{ color: colors.text, fontSize: 18, textAlign: rtl ? "right" : "left" }}>{turn.text}</Text>
            <Row>
              <Pressable accessibilityRole="button" accessibilityLabel={t.player.listen} onPress={() => Speech.speak(turn.text, { language: song.speechLang })}>
                <Text>🔊</Text>
              </Pressable>
              {shown.has(i) ? null : (
                <Text onPress={() => setShown(new Set(shown).add(i))} style={{ color: colors.accent }}>
                  {t.tutor.translation}
                </Text>
              )}
            </Row>
            {shown.has(i) ? <Text style={{ color: colors.muted }}>{turn.translation}</Text> : null}
          </View>
        ) : (
          <View key={i} style={[styles.bubble, { backgroundColor: colors.accentSoft, alignSelf: "flex-end" }]}>
            <Text style={{ color: colors.text, fontSize: 18, textAlign: rtl ? "right" : "left" }}>{turn.text}</Text>
            {turn.corrected ? (
              <View style={[styles.correction, { borderColor: colors.border }]}>
                <Text style={{ color: colors.text }}>
                  <Text style={{ fontWeight: "700" }}>{t.tutor.better} </Text>
                  {turn.corrected}
                </Text>
                {turn.explanation ? <Text style={{ color: colors.muted }}>{turn.explanation}</Text> : null}
              </View>
            ) : null}
          </View>
        ),
      )}
      {busy && turns.length > 0 ? <Body muted>{t.ai.loading}</Body> : null}
      {error ? <AiNotice state={{ status: "error", reason: error }} /> : null}
      {turns.length > 0 ? (
        <>
          <Field value={text} onChangeText={setText} placeholder={t.tutor.placeholder} maxLength={500} onSubmitEditing={send} returnKeyType="send" style={{ textAlign: rtl ? "right" : "left" }} />
          <Button label={t.tutor.send} onPress={send} disabled={busy || !text.trim()} />
          <Button kind="secondary" label={t.tutor.newChat} onPress={() => setTurns([])} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "88%", borderRadius: 18, padding: 12, gap: 6 },
  correction: { borderTopWidth: 1, paddingTop: 6, gap: 2 },
});
