import { LANGUAGE_NAMES, directionOf, format, aiFailureText } from "@shared/lib/i18n";
import { utcDay, type OwnProfile, type RoomMessage, type RoomProfile, type RoomsBackend } from "@shared/lib/rooms/backend";
import { challengeIndex, challengeWinner, checkMessage, outsideWords, songVocabulary, type RoomMode, type Vote } from "@shared/lib/rooms/rules";
import { tokenize, type Song } from "@shared/lib/song";
import { Link, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Party } from "../../components/Party";
import { ProfileGate } from "../../components/ProfileGate";
import { Body, Button, Card, Chip, Field, Notice, Row, Screen } from "../../components/ui";
import { callAi } from "../../lib/ai";
import { mutedStore } from "../../lib/learner";
import { getRooms, roomErrorText, useLive } from "../../lib/rooms";
import { useSong } from "../../lib/songs";
import { usePreferences } from "../../lib/usePreferences";

const PROMPTS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"] as const;

export default function RoomRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const song = useSong(id);
  const { t } = usePreferences();
  const rooms = getRooms();
  if (!song) return <Body muted>{t.catalog.notFound}</Body>;
  return (
    <Screen>
      <Body style={{ fontSize: 22, fontWeight: "800" }}>{song.title}</Body>
      <Body muted>{song.artist}</Body>
      {rooms.kind === "device" ? <Notice>{t.rooms.deviceMode}</Notice> : null}
      <ProfileGate>{(backend, me) => <RoomBody rooms={backend} song={song} me={me} />}</ProfileGate>
    </Screen>
  );
}

function RoomBody({ rooms, song, me }: { rooms: RoomsBackend; song: Song; me: OwnProfile }) {
  const { t } = usePreferences();
  const [tab, setTab] = useState<"chat" | "challenge" | "party">("chat");
  const subscribe = (onChange: () => void) => rooms.subscribe(song.id, onChange);
  const [messages] = useLive(() => rooms.messages(song.id), subscribe, [rooms, song.id]);
  const [votes] = useLive(() => rooms.votes(song.id), subscribe, [rooms, song.id]);
  const [counts] = useLive(() => rooms.memberCounts(), subscribe, [rooms, song.id]);
  const [blocked, reloadBlocked] = useLive(() => rooms.blocked(), null, [rooms]);
  const [following, reloadFollowing] = useLive(() => rooms.following(), null, [rooms]);
  const muted = mutedStore.useValue();
  const authorIds = useMemo(() => [...new Set((messages ?? []).map((m) => m.userId))].sort(), [messages]);
  const [profiles] = useLive(() => rooms.profiles(authorIds), null, [rooms, authorIds.join(",")]);
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const visible = (messages ?? []).filter((m) => !muted.includes(m.userId) && !(blocked ?? []).includes(m.userId));
  const people: Record<string, RoomProfile> = { ...profiles, [me.id]: me };

  return (
    <>
      <Body muted>{format(t.rooms.members, { n: counts?.[song.id] ?? 0 })}</Body>
      <Row>
        <Chip label={t.rooms.chat} active={tab === "chat"} onPress={() => setTab("chat")} />
        <Chip label={t.rooms.challenge} active={tab === "challenge"} onPress={() => setTab("challenge")} />
        <Chip label={t.party.tab} active={tab === "party"} onPress={() => setTab("party")} />
      </Row>
      {/* Stays mounted so the party keeps playing while you chat. */}
      <View style={tab === "party" ? undefined : { display: "none" }}>
        <Party rooms={rooms} song={song} me={me} />
      </View>
      {tab === "chat" ? <Chat rooms={rooms} song={song} me={me} messages={visible.filter((m) => !m.challengeDay)} people={people} onAuthor={setOpenProfile} /> : null}
      {tab === "challenge" ? <Challenge rooms={rooms} song={song} me={me} entries={visible.filter((m) => m.challengeDay)} votes={votes ?? []} people={people} onAuthor={setOpenProfile} /> : null}
      {openProfile ? (
        <ProfileSheet
          profile={people[openProfile]}
          userId={openProfile}
          isMe={openProfile === me.id}
          following={(following ?? []).includes(openProfile)}
          blocked={(blocked ?? []).includes(openProfile)}
          muted={muted.includes(openProfile)}
          onFollow={async (on) => {
            await rooms.setFollowing(openProfile, on);
            reloadFollowing();
          }}
          onBlock={async (on) => {
            await rooms.setBlocked(openProfile, on);
            reloadBlocked();
          }}
          onMute={(on) => mutedStore.set(on ? [...muted, openProfile] : muted.filter((id) => id !== openProfile))}
          onClose={() => setOpenProfile(null)}
        />
      ) : null}
    </>
  );
}

function Author({ profile, isMe, onPress }: { profile?: RoomProfile; isMe: boolean; onPress: () => void }) {
  const { t, colors } = usePreferences();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text style={{ color: colors.text, fontWeight: "700" }}>
        {profile?.avatar ?? "🎧"} {isMe ? t.rooms.you : profile?.name || "…"}
      </Text>
    </Pressable>
  );
}

function Chat({ rooms, song, me, messages, people, onAuthor }: { rooms: RoomsBackend; song: Song; me: OwnProfile; messages: RoomMessage[]; people: Record<string, RoomProfile>; onAuthor: (id: string) => void }) {
  const { t, colors, meaningFor } = usePreferences();
  const meaning = meaningFor(song.language);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function translate(message: RoomMessage) {
    if (!meaning) return;
    setTranslations((all) => ({ ...all, [message.id]: t.ai.loading }));
    const outcome = await callAi("translate", { lines: [message.body], learn: song.language, target: meaning });
    const text = outcome.ok ? (outcome.data.translations[0] ?? "") : aiFailureText(t, outcome.reason);
    setTranslations((all) => ({ ...all, [message.id]: text }));
  }

  return (
    <View style={{ gap: 10 }}>
      {notice ? <Notice>{notice}</Notice> : null}
      {messages.length === 0 ? <Body muted style={{ textAlign: "center" }}>{t.rooms.empty}</Body> : null}
      {messages.map((m) => (
        <Card key={m.id}>
          <Row style={{ justifyContent: "space-between" }}>
            <Author profile={people[m.userId]} isMe={m.userId === me.id} onPress={() => onAuthor(m.userId)} />
            <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
          </Row>
          <Text style={{ color: colors.text, fontSize: 18, textAlign: directionOf(song.language) === "rtl" ? "right" : "left" }}>{m.body}</Text>
          {translations[m.id] ? <Text style={{ color: colors.muted }}>{translations[m.id]}</Text> : null}
          <Row>
            {meaning ? (
              <Text onPress={() => void translate(m)} style={{ color: colors.muted }}>
                {t.rooms.translate}
              </Text>
            ) : null}
            {m.userId !== me.id ? (
              <Text
                onPress={async () => {
                  const outcome = await rooms.report(m.id);
                  setNotice(outcome.ok ? t.rooms.reported : roomErrorText(t, outcome.error));
                }}
                style={{ color: colors.muted }}
              >
                {t.rooms.report}
              </Text>
            ) : null}
          </Row>
        </Card>
      ))}
      <Composer rooms={rooms} song={song} challenge={false} />
    </View>
  );
}

function Composer({ rooms, song, challenge }: { rooms: RoomsBackend; song: Song; challenge: boolean }) {
  const { t, colors } = usePreferences();
  const vocabulary = useMemo(() => songVocabulary(song), [song]);
  const wordBank = useMemo(() => [...vocabulary].sort((a, b) => a.localeCompare(b, song.language)), [vocabulary, song.language]);
  const [chosenMode, setMode] = useState<RoomMode>("song");
  const mode: RoomMode = challenge ? "song" : chosenMode;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const problem = checkMessage(text, mode, vocabulary);
  const outside = mode === "song" ? outsideWords(text, vocabulary) : [];

  async function send() {
    if (problem || sending) return;
    setSending(true);
    const outcome = await rooms.send(song, text, mode, challenge);
    setSending(false);
    if (outcome.ok) {
      setText("");
      setError(null);
    } else setError(roomErrorText(t, outcome.error, outside));
  }

  return (
    <Card style={{ gap: 10 }}>
      {!challenge ? (
        <Row>
          <Chip label={t.rooms.modeSong} active={mode === "song"} onPress={() => setMode("song")} />
          <Chip label={t.rooms.modeFree} active={mode === "free"} onPress={() => setMode("free")} />
        </Row>
      ) : null}
      {mode === "song" ? (
        <>
          <Body muted>{t.rooms.modeSongHint}</Body>
          <ScrollView style={{ maxHeight: 130 }} nestedScrollEnabled>
            <Row>
              {wordBank.map((word) => (
                <Chip key={word} label={word} onPress={() => setText((current) => `${current.trimEnd()} ${word}`.trimStart())} />
              ))}
            </Row>
          </ScrollView>
        </>
      ) : null}
      <Field value={text} onChangeText={setText} placeholder={t.rooms.placeholder} accessibilityLabel={t.rooms.placeholder} />
      {outside.length > 0 ? (
        <Text>
          {tokenize(text).map((token, i) =>
            token.isWord && outside.includes(token.key) ? (
              <Text key={i} style={{ color: colors.bad, textDecorationLine: "underline" }}>
                {token.text}
              </Text>
            ) : (
              <Text key={i} style={{ color: colors.text }}>
                {token.text}
              </Text>
            ),
          )}
          {"\n"}
          <Text style={{ color: colors.bad }}>{roomErrorText(t, "outside_words", outside)}</Text>
        </Text>
      ) : null}
      {problem && problem !== "empty" && problem !== "outside_words" ? <Text style={{ color: colors.bad }}>{roomErrorText(t, problem)}</Text> : null}
      {error ? <Text style={{ color: colors.bad }}>{error}</Text> : null}
      <Button label={challenge ? t.rooms.submitEntry : t.rooms.send} disabled={Boolean(problem)} busy={sending} onPress={() => void send()} />
    </Card>
  );
}

function Challenge({ rooms, song, me, entries, votes, people, onAuthor }: { rooms: RoomsBackend; song: Song; me: OwnProfile; entries: RoomMessage[]; votes: Vote[]; people: Record<string, RoomProfile>; onAuthor: (id: string) => void }) {
  const { t, colors } = usePreferences();
  const [today] = useState(() => utcDay());
  const [yesterday] = useState(() => utcDay(-1));
  const [error, setError] = useState<string | null>(null);
  const words = useMemo(() => [...songVocabulary(song)].sort(), [song]);
  const prompt = PROMPTS[challengeIndex(song.id, today, PROMPTS.length)];
  const word = words[challengeIndex(song.id, `${today}:word`, words.length)] ?? "";
  const todays = entries.filter((e) => e.challengeDay === today);
  const winner = challengeWinner(entries.filter((e) => e.challengeDay === yesterday), votes);
  const count = (id: string) => votes.filter((v) => v.messageId === id).length;
  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.prompt, { backgroundColor: colors.accentSoft }]}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>{format(t.rooms[prompt], { word })}</Text>
      </View>
      {winner ? (
        <Card style={{ borderColor: colors.accent }}>
          <Text style={{ color: colors.accent, fontWeight: "700" }}>🏆 {t.rooms.winner}</Text>
          <Author profile={people[winner.userId]} isMe={winner.userId === me.id} onPress={() => onAuthor(winner.userId)} />
          <Body>{winner.body}</Body>
        </Card>
      ) : null}
      <Composer rooms={rooms} song={song} challenge />
      {error ? <Text style={{ color: colors.bad }}>{error}</Text> : null}
      <Body style={{ fontWeight: "700" }}>{t.rooms.entries}</Body>
      {todays.length === 0 ? <Body muted>{t.rooms.noEntries}</Body> : null}
      {[...todays]
        .sort((a, b) => count(b.id) - count(a.id) || a.createdAt - b.createdAt)
        .map((entry) => {
          const voted = votes.some((v) => v.messageId === entry.id && v.voterId === me.id);
          return (
            <Card key={entry.id}>
              <Author profile={people[entry.userId]} isMe={entry.userId === me.id} onPress={() => onAuthor(entry.userId)} />
              <Text style={{ color: colors.text, fontSize: 18 }}>{entry.body}</Text>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ color: colors.muted }}>{format(t.rooms.votes, { n: count(entry.id) })}</Text>
                {entry.userId !== me.id ? (
                  <Chip
                    label={voted ? t.rooms.voted : t.rooms.vote}
                    active={voted}
                    onPress={async () => {
                      if (voted) return;
                      const outcome = await rooms.vote(entry.id);
                      setError(outcome.ok ? null : roomErrorText(t, outcome.error));
                    }}
                  />
                ) : null}
              </Row>
            </Card>
          );
        })}
    </View>
  );
}

function ProfileSheet(props: {
  profile?: RoomProfile;
  userId: string;
  isMe: boolean;
  following: boolean;
  blocked: boolean;
  muted: boolean;
  onFollow: (on: boolean) => void;
  onBlock: (on: boolean) => void;
  onMute: (on: boolean) => void;
  onClose: () => void;
}) {
  const { t, colors } = usePreferences();
  const { profile } = props;
  return (
    <Modal transparent animationType="slide" visible onRequestClose={props.onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={props.onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <Text style={{ fontSize: 40 }}>{profile?.avatar ?? "🎧"}</Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
          {profile?.name}
          {props.isMe ? ` (${t.rooms.you})` : ""}
        </Text>
        {profile?.speaks ? (
          <Body muted>
            {t.rooms.speaks}: {LANGUAGE_NAMES[profile.speaks]}
          </Body>
        ) : null}
        {profile?.learning.length ? (
          <Body muted>
            {t.rooms.learning}: {profile.learning.map((l) => LANGUAGE_NAMES[l]).join(", ")}
          </Body>
        ) : null}
        {!props.isMe ? (
          <>
            <Link href={{ pathname: "/dm/[id]", params: { id: props.userId } }} onPress={props.onClose} style={[styles.message, { backgroundColor: colors.accent }]}>
              {t.buddies.message}
            </Link>
            <Row>
              <Chip label={props.following ? t.rooms.following : t.rooms.follow} active={props.following} onPress={() => props.onFollow(!props.following)} />
              <Chip label={props.muted ? t.rooms.unmute : t.rooms.mute} onPress={() => props.onMute(!props.muted)} />
              <Chip label={props.blocked ? t.rooms.unblock : t.rooms.block} onPress={() => props.onBlock(!props.blocked)} />
            </Row>
          </>
        ) : null}
        <Button kind="secondary" label={t.word.close} onPress={props.onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  prompt: { borderRadius: 16, padding: 16 },
  sheet: { padding: 20, paddingBottom: 32, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 10 },
  message: { color: "#fff", fontWeight: "700", textAlign: "center", paddingVertical: 12, borderRadius: 14, overflow: "hidden" },
});
