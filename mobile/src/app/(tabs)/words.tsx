import { LANGUAGE_NAMES, type UiLanguage } from "@shared/lib/i18n";
import { lookupGloss } from "@shared/lib/song";
import { isKnown, type ReviewState } from "@shared/lib/srs";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Body, Button, Card, Chip, Field, Row, Screen } from "../../components/ui";
import { knownStore, removeWord, reviewsStore, savedWordsStore, setNote, wordId, type SavedWord } from "../../lib/learner";
import { useSongs } from "../../lib/songs";
import { usePreferences } from "../../lib/usePreferences";

type Status = "all" | "new" | "learning" | "known";

function statusOf(id: string, known: string[], reviews: Record<string, ReviewState>): Exclude<Status, "all"> {
  if (known.includes(id) || isKnown(reviews[id])) return "known";
  return reviews[id]?.reps ? "learning" : "new";
}

const normalize = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** My Words: search, filter by song, language and status; notes; replay the line. */
export default function Words() {
  const { t, meaningFor } = usePreferences();
  const words = savedWordsStore.useValue();
  const known = knownStore.useValue();
  const reviews = reviewsStore.useValue();
  const songs = useSongs();
  const [query, setQuery] = useState("");
  const [songFilter, setSongFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<UiLanguage | "all">("all");
  const [status, setStatus] = useState<Status>("all");
  const songOf = (id: string) => songs.find((s) => s.id === id);
  const usedSongs = songs.filter((s) => words.some((w) => w.songId === s.id));
  const usedLanguages = [...new Set(usedSongs.map((s) => s.language))];

  const shown = words.filter((w) => {
    const song = songOf(w.songId);
    if (songFilter !== "all" && w.songId !== songFilter) return false;
    if (langFilter !== "all" && song?.language !== langFilter) return false;
    if (status !== "all" && statusOf(wordId(w.songId, w.key), known, reviews) !== status) return false;
    const q = normalize(query.trim());
    if (!q) return true;
    const meanings = song ? Object.values(lookupGloss(song, w.key)?.meanings ?? {}) : [];
    return [w.word, w.note, ...meanings].some((field) => field && normalize(field).includes(q));
  });

  if (words.length === 0) {
    return (
      <Screen>
        <Body muted style={{ textAlign: "center", marginTop: 40 }}>
          {t.words.empty}
        </Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <Field value={query} onChangeText={setQuery} placeholder={t.mywords.search} />
      <Row>
        {(["all", "new", "learning", "known"] as const).map((s) => (
          <Chip key={s} label={s === "all" ? t.mywords.all : s === "new" ? t.mywords.statusNew : s === "learning" ? t.mywords.statusLearning : t.mywords.statusKnown} active={status === s} onPress={() => setStatus(s)} />
        ))}
      </Row>
      {usedSongs.length > 1 ? (
        <Row>
          <Chip label={t.mywords.allSongs} active={songFilter === "all"} onPress={() => setSongFilter("all")} />
          {usedSongs.map((s) => (
            <Chip key={s.id} label={s.title} active={songFilter === s.id} onPress={() => setSongFilter(s.id)} />
          ))}
        </Row>
      ) : null}
      {usedLanguages.length > 1 ? (
        <Row>
          <Chip label={t.mywords.allLanguages} active={langFilter === "all"} onPress={() => setLangFilter("all")} />
          {usedLanguages.map((code) => (
            <Chip key={code} label={LANGUAGE_NAMES[code]} active={langFilter === code} onPress={() => setLangFilter(code)} />
          ))}
        </Row>
      ) : null}
      <Body muted>{t.words.count.replace("{n}", String(shown.length))}</Body>
      {shown.length === 0 ? <Body muted>{t.mywords.noMatch}</Body> : null}
      {shown.map((w) => (
        <WordRow key={`${w.songId}:${w.key}`} entry={w} meaning={(() => {
          const song = songOf(w.songId);
          const lang = song ? meaningFor(song.language) : null;
          return song && lang ? lookupGloss(song, w.key)?.meanings[lang] : undefined;
        })()} line={songOf(w.songId)?.lines[w.line]?.text} status={statusOf(wordId(w.songId, w.key), known, reviews)} />
      ))}
    </Screen>
  );
}

function WordRow({ entry, meaning, line, status }: { entry: SavedWord; meaning?: string; line?: string; status: "new" | "learning" | "known" }) {
  const { t, colors } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [note, setNoteText] = useState(entry.note ?? "");
  const label = status === "new" ? t.mywords.statusNew : status === "learning" ? t.mywords.statusLearning : t.mywords.statusKnown;
  return (
    <Card>
      <View style={styles.head}>
        <Text style={[styles.word, { color: colors.text }]}>
          {entry.word}
          {entry.key.includes(" ") ? ` · ${t.mywords.phrase}` : ""}
        </Text>
        <Text style={{ color: status === "known" ? colors.good : colors.muted }}>{label}</Text>
      </View>
      {meaning ? <Text style={{ color: colors.text }}>{meaning}</Text> : null}
      {line ? <Text style={{ color: colors.muted }}>“{line}”</Text> : null}
      {entry.note && !editing ? <Text style={{ color: colors.text }}>📝 {entry.note}</Text> : null}
      {editing ? (
        <>
          <Field value={note} onChangeText={setNoteText} placeholder={t.mywords.note} multiline maxLength={500} />
          <Button
            label={t.mywords.saveNote}
            onPress={() => {
              setNote(entry.songId, entry.key, note);
              setEditing(false);
            }}
          />
        </>
      ) : null}
      <Row>
        <Link href={{ pathname: "/song/[id]", params: { id: entry.songId, line: String(entry.line) } }} style={{ color: colors.accent, fontWeight: "600" }}>
          ▶ {t.words.replay}
        </Link>
        <Pressable accessibilityRole="button" onPress={() => setEditing(!editing)}>
          <Text style={{ color: colors.accent }}>{entry.note ? t.mywords.note : t.mywords.addNote}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => removeWord(entry.songId, entry.key)}>
          <Text style={{ color: colors.muted }}>{t.words.remove}</Text>
        </Pressable>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  word: { fontSize: 20, fontWeight: "700", flexShrink: 1 },
});
