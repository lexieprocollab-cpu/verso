import { directionOf, format } from "@shared/lib/i18n";
import {
  HEARTBEAT_MS,
  HOST_TIMEOUT_MS,
  REACTIONS,
  activeMembers,
  needsResync,
  parsePartyMessage,
  positionNow,
  type Anchor,
  type Member,
  type PartyMessage,
  type Reaction,
} from "@shared/lib/party";
import type { OwnProfile, PartyChannel, RoomsBackend } from "@shared/lib/rooms/backend";
import { formatTime, lineIndexAt, tokenize, wordIndexAt, type Song } from "@shared/lib/song";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { audioSourceFor } from "../lib/offline";
import { useAudioMedia, usePlayback, type Media } from "../lib/usePlayback";
import { usePreferences } from "../lib/usePreferences";
import { Body, Button, Card } from "./ui";
import { WordCard, type Selection } from "./WordCard";
import { YouTubeVideo } from "./YouTubeVideo";

type Playback = ReturnType<typeof usePlayback>;
type Floating = { id: number; emoji: Reaction; x: number };

const stateOf = (me: OwnProfile, position: number, playing: boolean): PartyMessage => ({ type: "state", from: me.id, name: me.name, position, playing });

/** Listening party: the host's play, pause and seek reach everyone; reactions float over the line. */
export function Party({ rooms, song, me }: { rooms: RoomsBackend; song: Song; me: OwnProfile }) {
  const { t, colors, meaningFor } = usePreferences();
  const meaning = meaningFor(song.language);
  const [ytMedia, setYtMedia] = useState<Media | null>(null);
  const audio = useAudioMedia(song.youtubeId ? undefined : audioSourceFor(song));
  const playback = usePlayback(song.duration, song.youtubeId ? ytMedia : audio);
  const [hostId, setHostId] = useState<string | null>(null);
  const [hostName, setHostName] = useState("");
  const [hostPlaying, setHostPlaying] = useState(false);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [floating, setFloating] = useState<Floating[]>([]);
  const [ended, setEnded] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [selection, setSelection] = useState<Selection | null>(null);
  const channel = useRef<PartyChannel | null>(null);
  const live = useRef<{ playback: Playback; hostId: string | null; lastStateAt: number; anchor: Anchor | null; nextFloat: number }>({
    playback,
    hostId: null,
    lastStateAt: 0,
    anchor: null,
    nextFloat: 0,
  });
  live.current.playback = playback;

  function float(emoji: Reaction) {
    const id = ++live.current.nextFloat;
    setFloating((all) => [...all.slice(-20), { id, emoji, x: 10 + Math.random() * 75 }]);
    setTimeout(() => setFloating((all) => all.filter((f) => f.id !== id)), 2600);
  }

  function follow(position: number, playing: boolean) {
    const p = live.current.playback;
    if (needsResync(p.now(), position)) p.seek(position);
    if (playing) p.play();
    else p.pause();
  }

  useEffect(() => {
    const ch = rooms.partyChannel(song.id);
    channel.current = ch;
    const state = live.current;
    const becomeGuestOf = (id: string | null, name = "") => {
      state.hostId = id;
      setHostId(id);
      setHostName(name);
    };
    ch.onMessage((raw) => {
      const m = parsePartyMessage(raw);
      if (!m || m.from === me.id) return;
      const now = Date.now();
      if (m.type !== "end") setMembers((all) => ({ ...all, [m.from]: { name: m.name, seenAt: now } }));
      if (m.type === "hello" && state.hostId === me.id) ch.send(stateOf(me, state.playback.now(), state.playback.playing));
      if (m.type === "react") float(m.emoji);
      if (m.type === "end" && m.from === state.hostId) {
        becomeGuestOf(null);
        setEnded(true);
        state.playback.pause();
      }
      if (m.type === "state") {
        // Two people pressed Start at once: the smaller id keeps hosting.
        if (state.hostId === me.id && me.id < m.from) return;
        if (state.hostId !== m.from) becomeGuestOf(m.from, m.name);
        setEnded(false);
        setHostPlaying(m.playing);
        state.lastStateAt = now;
        state.anchor = { position: m.position, playing: m.playing, receivedAt: now };
        follow(m.position, m.playing);
      }
    });
    ch.send({ type: "hello", from: me.id, name: me.name });
    const timer = setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (state.hostId === me.id) ch.send(stateOf(me, state.playback.now(), state.playback.playing));
      else ch.send({ type: "ping", from: me.id, name: me.name });
      if (state.hostId && state.hostId !== me.id && now - state.lastStateAt > HOST_TIMEOUT_MS) {
        becomeGuestOf(null);
        setEnded(true);
        state.playback.pause();
      }
    }, HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      if (state.hostId === me.id) ch.send({ type: "end", from: me.id });
      state.playback.pause();
      ch.close();
    };
    // follow and float only touch refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, song.id, me.id, me.name]);

  const isHost = hostId === me.id;
  const send = (message: PartyMessage) => channel.current?.send(message);
  const listening = activeMembers(members, clock).length + 1;
  const index = lineIndexAt(song.lines, playback.time);
  const line = song.lines[Math.max(index, 0)];
  const next = song.lines[Math.max(index, 0) + 1];
  const translation = meaning && index >= 0 ? line.translations[meaning] : undefined;
  const rtl = directionOf(song.language) === "rtl";

  if (!hostId) {
    return (
      <Card style={{ alignItems: "center", gap: 10 }}>
        <Text style={{ fontSize: 40 }}>🎧</Text>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{t.party.title}</Text>
        <Body muted style={{ textAlign: "center" }}>
          {t.party.intro}
        </Body>
        {ended ? <Body muted>{t.party.ended}</Body> : null}
        <Body muted>{format(t.party.listening, { n: listening })}</Body>
        <View style={{ alignSelf: "stretch" }}>
          <Button
            label={t.party.start}
            onPress={() => {
              live.current.hostId = me.id;
              setHostId(me.id);
              setEnded(false);
              send(stateOf(me, playback.now(), playback.playing));
            }}
          />
        </View>
      </Card>
    );
  }

  const highlight = index >= 0 ? wordIndexAt(line, playback.time) : -1;
  let wordIndex = -1;
  return (
    <View style={{ gap: 12 }}>
      {song.youtubeId ? <YouTubeVideo videoId={song.youtubeId} onMedia={setYtMedia} /> : null}
      <View style={styles.between}>
        <Text style={{ color: colors.text, fontWeight: "700" }}>{isHost ? t.party.youHost : format(t.party.host, { name: hostName })}</Text>
        <Text style={{ color: colors.muted }}>🎧 {format(t.party.listening, { n: listening })}</Text>
      </View>
      <View style={[styles.stage, { backgroundColor: colors.accentSoft }]}>
        <Text style={[styles.line, { color: colors.text, textAlign: rtl ? "right" : "center" }]}>
          {tokenize(index >= 0 ? line.text : song.lines[0].text).map((token, k) => {
            if (!token.isWord) return token.text;
            wordIndex++;
            return (
              <Text key={k} onPress={() => setSelection({ key: token.key, word: token.text, line: Math.max(index, 0) })} style={wordIndex === highlight ? { color: colors.accent } : undefined}>
                {token.text}
              </Text>
            );
          })}
        </Text>
        {translation ? <Text style={{ color: colors.muted, textAlign: "center", marginTop: 6 }}>{translation}</Text> : null}
        {next ? <Text style={{ color: colors.text, opacity: 0.45, textAlign: "center", marginTop: 14, fontSize: 17 }}>{next.text}</Text> : null}
        {floating.map((f) => (
          <FloatingEmoji key={f.id} emoji={f.emoji} x={f.x} />
        ))}
      </View>
      <View style={styles.between}>
        {isHost ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playback.playing ? t.player.pause : t.player.play}
            onPress={() => {
              if (playback.playing) playback.pause();
              else playback.play();
              send(stateOf(me, playback.now(), !playback.playing));
            }}
            style={[styles.play, { backgroundColor: colors.accent }]}
          >
            <Text style={{ color: "#fff", fontSize: 20 }}>{playback.playing ? "❚❚" : "▶"}</Text>
          </Pressable>
        ) : hostPlaying && !playback.playing ? (
          <Button
            label={`🔊 ${t.party.listenAlong}`}
            onPress={() => {
              const anchor = live.current.anchor;
              if (anchor) follow(positionNow(anchor, Date.now(), playback.duration), anchor.playing);
            }}
          />
        ) : (
          <View />
        )}
        <Text style={{ color: colors.muted, fontVariant: ["tabular-nums"] }}>{formatTime(playback.time)}</Text>
      </View>
      <View style={styles.reactions}>
        {REACTIONS.map((emoji) => (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={`${t.party.react} ${emoji}`}
            onPress={() => {
              float(emoji);
              send({ type: "react", from: me.id, name: me.name, emoji });
            }}
            style={[styles.reaction, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={{ fontSize: 24 }}>{emoji}</Text>
          </Pressable>
        ))}
      </View>
      {isHost ? (
        <Button
          kind="secondary"
          label={t.party.end}
          onPress={() => {
            send({ type: "end", from: me.id });
            live.current.hostId = null;
            setHostId(null);
            playback.pause();
          }}
        />
      ) : null}
      {selection ? <WordCard song={song} selection={selection} meaning={meaning} onClose={() => setSelection(null)} /> : null}
    </View>
  );
}

function FloatingEmoji({ emoji, x }: { emoji: string; x: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 2500, useNativeDriver: true }).start();
  }, [progress]);
  return (
    <Animated.Text
      accessibilityElementsHidden
      style={{
        position: "absolute",
        bottom: 8,
        left: `${x}%`,
        fontSize: 30,
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -140] }) }],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  stage: { borderRadius: 18, paddingVertical: 32, paddingHorizontal: 16, overflow: "hidden", minHeight: 180 },
  line: { fontSize: 28, fontWeight: "800", lineHeight: 36 },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  reactions: { flexDirection: "row", gap: 6 },
  reaction: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 8, alignItems: "center" },
});
