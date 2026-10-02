import { directionOf, type UiLanguage } from "@shared/lib/i18n";
import { lookupGloss, type Song } from "@shared/lib/song";
import * as Speech from "expo-speech";
import { useEffect } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAi } from "../lib/ai";
import { isSaved, knownStore, savedWordsStore, toggleKnown, toggleSaved, wordId } from "../lib/learner";
import { usePreferences } from "../lib/usePreferences";
import { AiNotice } from "./AiNotice";

export type Selection = { key: string; word: string; line: number };

/**
 * Meaning of a tapped word: the song's dictionary first, else the AI; Save, "I know it" and pronunciation.
 * `overVideo`: the song plays in an embedded YouTube player, which nothing may cover or dim (YouTube API
 * policy), so the card docks at the bottom of the screen instead of opening a full-screen modal.
 */
export function WordCard({
  song,
  selection,
  meaning,
  onClose,
  overVideo = false,
}: {
  song: Song;
  selection: Selection;
  meaning: UiLanguage | null;
  onClose: () => void;
  overVideo?: boolean;
}) {
  const { t, colors } = usePreferences();
  const saved = isSaved(savedWordsStore.useValue(), song.id, selection.key);
  const id = wordId(song.id, selection.key);
  const known = knownStore.useValue().includes(id);
  const gloss = lookupGloss(song, selection.key);
  const fromDictionary = meaning ? gloss?.meanings[meaning] : undefined;
  const ai = useAi("word");
  const line = song.lines[selection.line]?.text ?? "";
  const { run } = ai;

  // No dictionary entry in the learner's language: ask the AI right away.
  useEffect(() => {
    if (!fromDictionary && meaning && line) void run({ word: selection.word, line, learn: song.language, meaning });
  }, [fromDictionary, meaning, line, selection.word, song.language, run]);

  const aiWord = ai.state.status === "done" ? ai.state.data : null;
  const text = fromDictionary ?? aiWord?.meaning;
  const lemma = gloss?.lemma ?? (aiWord?.lemma || undefined);
  const note = gloss?.note ?? (aiWord?.note || undefined);
  const meaningRtl = meaning ? directionOf(meaning) === "rtl" : false;

  const sheet = (
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <View style={styles.head}>
          <Text style={[styles.word, { color: colors.text }]}>{selection.word}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t.player.listen} onPress={() => Speech.speak(selection.word, { language: song.speechLang, rate: 0.9 })}>
            <Text style={[styles.listen, { borderColor: colors.border, color: colors.text }]}>🔊 {t.player.listen}</Text>
          </Pressable>
        </View>
        {lemma ? (
          <Text style={{ color: colors.muted }}>
            {t.word.baseForm}: {lemma}
          </Text>
        ) : null}
        {text ? <Text style={[styles.meaning, { color: colors.text, textAlign: meaningRtl ? "right" : "left" }]}>{text}</Text> : null}
        {!text && ai.state.status !== "loading" && ai.state.status !== "error" ? <Text style={{ color: colors.muted }}>{t.word.noGloss}</Text> : null}
        <AiNotice state={ai.state} />
        {aiWord?.hebrew_root ? (
          <Text style={{ color: colors.muted }}>
            {t.ai.root}: {aiWord.hebrew_root}
          </Text>
        ) : null}
        {note ? (
          <Text style={{ color: colors.muted }}>
            {t.word.grammar}: {note}
          </Text>
        ) : null}
        <Text style={[styles.line, { color: colors.muted }]}>
          {t.word.fromLine}: {line}
        </Text>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            onPress={() => toggleSaved({ key: selection.key, word: selection.word, songId: song.id, line: selection.line })}
            style={[styles.button, { backgroundColor: saved ? colors.accentSoft : colors.accent }]}
          >
            <Text style={[styles.buttonText, { color: saved ? colors.accent : "#fff" }]}>{saved ? `♥ ${t.word.saved}` : `♡ ${t.word.save}`}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => toggleKnown(id)} style={[styles.button, styles.secondary, { borderColor: colors.border }]}>
            <Text style={[styles.buttonText, { color: known ? colors.good : colors.text }]}>{known ? t.more.known : t.more.knowIt}</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
          <Text style={{ color: colors.muted }}>{t.word.close}</Text>
        </Pressable>
      </View>
  );

  if (overVideo) {
    return (
      <View style={[styles.dock, { borderColor: colors.border }]}>
        <ScrollView>{sheet}</ScrollView>
      </View>
    );
  }
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t.word.close} />
      {sheet}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "55%",
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  sheet: { padding: 20, paddingBottom: 32, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  word: { fontSize: 30, fontWeight: "800", flexShrink: 1 },
  listen: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: "hidden" },
  meaning: { fontSize: 20 },
  line: { marginTop: 4 },
  buttons: { flexDirection: "row", gap: 10, marginTop: 10 },
  button: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  secondary: { borderWidth: 1 },
  buttonText: { fontSize: 16, fontWeight: "700" },
  close: { alignItems: "center", paddingTop: 8 },
});
