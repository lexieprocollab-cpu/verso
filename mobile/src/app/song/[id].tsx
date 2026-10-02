import { TRIAL_SONGS } from "@shared/lib/billing";
import { LANGUAGE_NAMES, UI_LANGUAGES, directionOf, format } from "@shared/lib/i18n";
import { understoodPercent } from "@shared/lib/progress";
import { formatTime, lineIndexAt, tokenize, wordIndexAt, type Song } from "@shared/lib/song";
import { isKnown } from "@shared/lib/srs";
import * as Speech from "expo-speech";
import { Link, Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AiNotice } from "../../components/AiNotice";
import { Chip, Row } from "../../components/ui";
import { WordCard, type Selection } from "../../components/WordCard";
import { YouTubeVideo } from "../../components/YouTubeVideo";
import { isPremium, useAccess, useSongAccess } from "../../lib/access";
import { useAi } from "../../lib/ai";
import { addListening, knownStore, reviewsStore, startTrialSong, updatePreferences, wordId, type TextSize, type TranslationMode } from "../../lib/learner";
import { audioSourceFor, canSaveOffline, offlineSongsStore, removeOffline, saveOffline } from "../../lib/offline";
import { useCatalogLoaded, useSong } from "../../lib/songs";
import { useAudioMedia, usePlayback, type Media } from "../../lib/usePlayback";
import { usePreferences } from "../../lib/usePreferences";

const SIZE: Record<TextSize, number> = { s: 20, m: 26, l: 32, xl: 38 };

export default function PlayerRoute() {
  const { id, line } = useLocalSearchParams<{ id: string; line?: string }>();
  const song = useSong(id);
  const loaded = useCatalogLoaded();
  const access = useSongAccess(song);
  const { t, colors } = usePreferences();

  if (!song) {
    return loaded ? <Text style={[styles.missing, { color: colors.muted }]}>{t.catalog.notFound}</Text> : <ActivityIndicator style={{ marginTop: 40 }} />;
  }
  if (!access.allowed) return <Redirect href={{ pathname: "/paywall", params: { song: song.id } }} />;
  const startLine = line !== undefined && /^\d+$/.test(line) ? Number(line) : null;
  return <Player key={song.id} song={song} trialNumber={access.trialNumber} startLine={startLine} />;
}

function Player({ song, trialNumber, startLine }: { song: Song; trialNumber: number | null; startLine: number | null }) {
  const { t, colors, meaningFor, translation, size } = usePreferences();
  const access = useAccess();
  const [ytMedia, setYtMedia] = useState<Media | null>(null);
  const audioMedia = useAudioMedia(song.youtubeId ? undefined : audioSourceFor(song));
  const media = song.youtubeId ? ytMedia : audioMedia;
  const startTime = startLine !== null ? (song.lines[startLine]?.start ?? 0) : 0;
  const playback = usePlayback(song.duration, media, startTime);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [showDisplay, setShowDisplay] = useState(false);
  const [explained, setExplained] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const [offlineState, setOfflineState] = useState<"idle" | "saving" | "failed" | "premium">("idle");
  const explain = useAi("explain");
  const known = knownStore.useValue();
  const reviews = reviewsStore.useValue();
  const offline = offlineSongsStore.useValue().some((o) => o.song.id === song.id);
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const meaning = meaningFor(song.language);
  const current = lineIndexAt(song.lines, playback.time);
  const focusLine = Math.max(current, 0);
  const songRtl = directionOf(song.language) === "rtl";
  const understood = understoodPercent(song, (key) => known.includes(wordId(song.id, key)) || isKnown(reviews[wordId(song.id, key)]));

  useEffect(() => {
    if (trialNumber !== null) startTrialSong(song.id);
  }, [song.id, trialNumber]);

  useEffect(() => {
    if (current >= 0) scroll.current?.scrollTo({ y: Math.max(0, (offsets.current[current] ?? 0) - 140), animated: true });
  }, [current]);

  // A song without a recording (the demo) runs on a timer: the phone's voice reads each line as it starts.
  const voiced = !song.audioUrl && !song.youtubeId;
  const currentText = current >= 0 ? song.lines[current].text : null;
  useEffect(() => {
    if (!voiced) return;
    void Speech.stop();
    if (playback.playing && currentText) Speech.speak(currentText, { language: song.speechLang, rate: 0.9 * playback.rate });
  }, [voiced, playback.playing, currentText, playback.rate, song.speechLang]);
  useEffect(() => () => void Speech.stop(), []);

  // Listening time for the progress screen, in 5-second steps.
  useEffect(() => {
    if (!playback.playing) return;
    const timer = setInterval(() => addListening(5), 5000);
    return () => clearInterval(timer);
  }, [playback.playing]);

  function toggleRepeat() {
    const target = song.lines[focusLine];
    playback.setLoop(playback.loop ? null : { start: target.start, end: target.end });
    if (!playback.loop) playback.seek(target.start);
  }

  function explainLine() {
    setExplained(focusLine);
    void explain.run({ line: song.lines[focusLine].text, learn: song.language, meaning: meaning ?? "en" });
  }

  async function toggleOffline() {
    if (offline) return removeOffline(song.id);
    if (!isPremium(access)) return setOfflineState("premium");
    setOfflineState("saving");
    setOfflineState((await saveOffline(song)) ? "idle" : "failed");
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        {song.youtubeId ? <YouTubeVideo videoId={song.youtubeId} onMedia={setYtMedia} /> : null}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {song.title}
            </Text>
            <Text style={{ color: colors.muted }} numberOfLines={1}>
              {song.artist}
            </Text>
          </View>
          <Link href={{ pathname: "/quiz/[id]", params: { id: song.id } }} style={[styles.quiz, { backgroundColor: colors.accent }]}>
            {t.player.takeQuiz}
          </Link>
        </View>
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playback.playing ? t.player.pause : t.player.play}
            onPress={playback.playing ? playback.pause : playback.play}
            style={[styles.play, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.playIcon}>{playback.playing ? "❚❚" : "▶"}</Text>
          </Pressable>
          <SeekBar time={playback.time} duration={playback.duration} onSeek={playback.seek} />
          <Text style={{ color: colors.muted, fontVariant: ["tabular-nums"] }}>
            {formatTime(playback.time)} / {formatTime(playback.duration)}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={`🔁 ${t.player.repeatLine}`} active={playback.loop !== null} onPress={toggleRepeat} />
          <Chip label={`🐢 ${t.player.slow} 0.75×`} active={playback.rate !== 1} onPress={() => playback.setRate(playback.rate === 1 ? 0.75 : 1)} />
          <Chip label={`🔊 ${t.player.listen}`} onPress={() => Speech.speak(song.lines[focusLine].text, { language: song.speechLang, rate: playback.rate === 1 ? 0.9 : 0.7 })} />
          <Chip label={`✨ ${t.ai.explainLine}`} active={explained !== null} onPress={explainLine} />
          <Chip label={`Aa ${t.player.display}`} active={showDisplay} onPress={() => setShowDisplay(!showDisplay)} />
          {canSaveOffline(song) ? (
            <Chip label={offline ? t.offline.saved : offlineState === "saving" ? t.offline.saving : `⬇ ${t.offline.save}`} active={offline} onPress={() => void toggleOffline()} />
          ) : null}
        </ScrollView>
        {offlineState === "premium" || offlineState === "failed" ? (
          <Text style={{ color: colors.muted, fontSize: 13 }}>{offlineState === "premium" ? t.offline.premium : t.offline.failed}</Text>
        ) : null}
        {trialNumber !== null ? <Text style={{ color: colors.muted, fontSize: 13 }}>{format(t.paywall.freeSong, { n: trialNumber, total: TRIAL_SONGS })}</Text> : null}
        {showDisplay ? <DisplaySettings /> : null}
        {explained !== null ? (
          <View style={[styles.explain, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.muted }}>{song.lines[explained].text}</Text>
            <AiNotice state={explain.state} />
            {explain.state.status === "done" ? (
              <>
                <Text style={{ color: colors.text }}>
                  <Text style={{ fontWeight: "700" }}>{t.ai.meaning}: </Text>
                  {explain.state.data.meaning}
                </Text>
                <Text style={{ color: colors.text }}>
                  <Text style={{ fontWeight: "700" }}>{t.word.grammar}: </Text>
                  {explain.state.data.grammar}
                </Text>
                {explain.state.data.culture ? (
                  <Text style={{ color: colors.text }}>
                    <Text style={{ fontWeight: "700" }}>{t.ai.culture}: </Text>
                    {explain.state.data.culture}
                  </Text>
                ) : null}
              </>
            ) : null}
            <Pressable onPress={() => setExplained(null)}>
              <Text style={{ color: colors.accent }}>{t.word.close}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView ref={scroll} contentContainerStyle={styles.lyrics}>
        <Text style={{ color: colors.muted }}>{format(t.more.understood, { n: understood })}</Text>
        {voiced ? <Text style={{ color: colors.muted }}>{t.player.demoNote}</Text> : null}
        {song.lines.map((lyric, i) => {
          const isCurrent = i === current;
          const highlight = isCurrent ? wordIndexAt(lyric, playback.time) : -1;
          const text = meaning ? lyric.translations[meaning] : undefined;
          const show = text && (translation === "always" || (translation === "tap" && revealed.has(i)));
          let wordIndex = -1;
          return (
            <Pressable key={i} onLayout={(e) => (offsets.current[i] = e.nativeEvent.layout.y)} onPress={() => playback.seek(lyric.start)} style={{ opacity: isCurrent ? 1 : 0.5 }}>
              <Text style={{ color: colors.text, fontSize: SIZE[size], lineHeight: SIZE[size] * 1.3, textAlign: songRtl ? "right" : "left", fontWeight: isCurrent ? "800" : "500" }}>
                {tokenize(lyric.text).map((token, k) => {
                  if (!token.isWord) return token.text;
                  wordIndex++;
                  const active = wordIndex === highlight;
                  return (
                    <Text key={k} accessibilityRole="button" onPress={() => setSelection({ key: token.key, word: token.text, line: i })} style={active ? { color: colors.accent } : undefined}>
                      {token.text}
                    </Text>
                  );
                })}
              </Text>
              {show ? <Text style={[styles.translation, { color: colors.muted, textAlign: meaning && directionOf(meaning) === "rtl" ? "right" : "left" }]}>{text}</Text> : null}
              {text && translation === "tap" && !revealed.has(i) ? (
                <Text onPress={() => setRevealed(new Set(revealed).add(i))} style={{ color: colors.accent, marginTop: 4 }}>
                  🌐 {t.player.translate}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {selection ? <WordCard song={song} selection={selection} meaning={meaning} onClose={() => setSelection(null)} overVideo={Boolean(song.youtubeId)} /> : null}
    </View>
  );
}

function SeekBar({ time, duration, onSeek }: { time: number; duration: number; onSeek: (t: number) => void }) {
  const { colors } = usePreferences();
  const [width, setWidth] = useState(1);
  const percent = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  return (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={(e) => onSeek((e.nativeEvent.locationX / width) * duration)}
      style={styles.seek}
    >
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.accent }]} />
      </View>
    </Pressable>
  );
}

function DisplaySettings() {
  const { t, colors, speak, lang, translation, size } = usePreferences();
  const modes: [TranslationMode, string][] = [
    ["always", t.player.transAlways],
    ["tap", t.player.transTap],
    ["off", t.player.transOff],
  ];
  return (
    <View style={[styles.explain, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={{ color: colors.text, fontWeight: "700" }}>{t.player.iSpeak}</Text>
      <Row>
        {UI_LANGUAGES.map((code) => (
          <Chip key={code} label={LANGUAGE_NAMES[code]} active={(speak ?? lang) === code} onPress={() => updatePreferences({ speak: code })} />
        ))}
      </Row>
      <Text style={{ color: colors.text, fontWeight: "700" }}>{t.player.translation}</Text>
      <Row>
        {modes.map(([mode, label]) => (
          <Chip key={mode} label={label} active={translation === mode} onPress={() => updatePreferences({ translation: mode })} />
        ))}
      </Row>
      <Text style={{ color: colors.text, fontWeight: "700" }}>{t.player.textSize}</Text>
      <Row>
        {(["s", "m", "l", "xl"] as const).map((s) => (
          <Chip key={s} label={s.toUpperCase()} active={size === s} onPress={() => updatePreferences({ size: s })} />
        ))}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  missing: { padding: 24, textAlign: "center" },
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  title: { fontSize: 21, fontWeight: "800" },
  quiz: { color: "#fff", fontWeight: "700", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: "hidden" },
  controls: { flexDirection: "row", alignItems: "center", gap: 12 },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  playIcon: { color: "#fff", fontSize: 20 },
  seek: { flex: 1, paddingVertical: 14 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6 },
  chips: { gap: 8, paddingVertical: 2 },
  explain: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  lyrics: { padding: 16, gap: 18, paddingBottom: 240 },
  translation: { fontSize: 16, marginTop: 4 },
});
