import { LANGUAGE_NAMES, UI_LANGUAGES, type UiLanguage } from "@shared/lib/i18n";
import { AVATARS, type OwnProfile, type RoomsBackend } from "@shared/lib/rooms/backend";
import { isOldEnough } from "@shared/lib/rooms/rules";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Text } from "react-native";
import { onboardingStore } from "../lib/learner";
import { getRooms, useLive } from "../lib/rooms";
import { createStore } from "../lib/store";
import { getSupabase } from "../lib/supabase";
import { usePreferences } from "../lib/usePreferences";
import { Body, Button, Card, Chip, Field, Row } from "./ui";

/** Set once someone enters a birth date under 13, so the age gate can't be retried. */
const ageLockStore = createStore<boolean>("verso.rooms.ageLock", false, (v): v is boolean => typeof v === "boolean");

/** Children render once the learner is signed in (cloud), 13+ and has a room profile. */
export function ProfileGate({ children }: { children: (rooms: RoomsBackend, me: OwnProfile) => ReactNode }) {
  const { t } = usePreferences();
  const rooms = getRooms();
  const [me, reload] = useLive(() => rooms.me(), null, [rooms]);
  const locked = ageLockStore.useValue();
  if (me === undefined) return <ActivityIndicator style={{ marginTop: 24 }} />;
  if (getSupabase() && me === null) {
    return (
      <Card>
        <Body>{t.rooms.signIn}</Body>
      </Card>
    );
  }
  if (locked || (me?.birthYear && me.birthMonth && !isOldEnough(me.birthYear, me.birthMonth, new Date()))) {
    return (
      <Card>
        <Body style={{ fontWeight: "700" }}>{t.rooms.tooYoung}</Body>
      </Card>
    );
  }
  if (!me?.name || !me.birthYear || !me.birthMonth) return <ProfileSetup rooms={rooms} current={me} onSaved={reload} />;
  return <>{children(rooms, me)}</>;
}

function ProfileSetup({ rooms, current, onSaved }: { rooms: RoomsBackend; current: OwnProfile | null; onSaved: () => void }) {
  const { t, lang, speak: iSpeak, colors } = usePreferences();
  const onboarding = onboardingStore.useValue();
  const [thisYear] = useState(() => new Date().getFullYear());
  const [name, setName] = useState(current?.name ?? "");
  const [avatar, setAvatar] = useState(current?.avatar || AVATARS[0]);
  const [month, setMonth] = useState(current?.birthMonth ?? 0);
  const [year, setYear] = useState(current?.birthYear ?? 0);
  const [yearText, setYearText] = useState(current?.birthYear ? String(current.birthYear) : "");
  const [speaks, setSpeaks] = useState<UiLanguage>(current?.speaks ?? iSpeak ?? lang);
  const [learning, setLearning] = useState<UiLanguage[]>(current?.learning.length ? current.learning : onboarding.learn ? [onboarding.learn] : []);
  const [saving, setSaving] = useState(false);
  const monthNames = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(lang, { month: "short" }).format(new Date(2000, i, 15)));
  const ready = name.trim().length > 0 && month > 0 && year >= thisYear - 100 && year <= thisYear && !saving;

  async function save() {
    setSaving(true);
    if (!isOldEnough(year, month, new Date())) ageLockStore.set(true);
    await rooms.saveProfile({ name, avatar, birthYear: year, birthMonth: month, learning, speaks, favorites: onboarding.favorites.slice(0, 3) });
    setSaving(false);
    onSaved();
  }

  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{t.rooms.setupTitle}</Text>
      <Body style={{ fontWeight: "700" }}>{t.rooms.name}</Body>
      <Field value={name} onChangeText={setName} maxLength={60} accessibilityLabel={t.rooms.name} />
      <Body style={{ fontWeight: "700" }}>{t.rooms.avatar}</Body>
      <Row>
        {AVATARS.map((a) => (
          <Chip key={a} label={a} active={avatar === a} onPress={() => setAvatar(a)} />
        ))}
      </Row>
      <Body style={{ fontWeight: "700" }}>{t.rooms.birth}</Body>
      <Body muted>{t.rooms.birthWhy}</Body>
      <Row>
        {monthNames.map((m, i) => (
          <Chip key={m} label={m} active={month === i + 1} onPress={() => setMonth(i + 1)} />
        ))}
      </Row>
      <Field
        value={yearText}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, "").slice(0, 4);
          setYearText(digits);
          setYear(digits.length === 4 ? Number(digits) : 0);
        }}
        placeholder={t.rooms.year}
        accessibilityLabel={t.rooms.year}
        keyboardType="number-pad"
      />
      <Body style={{ fontWeight: "700" }}>{t.rooms.speaks}</Body>
      <Row>
        {UI_LANGUAGES.map((code) => (
          <Chip key={code} label={LANGUAGE_NAMES[code]} active={speaks === code} onPress={() => setSpeaks(code)} />
        ))}
      </Row>
      <Body style={{ fontWeight: "700" }}>{t.rooms.learning}</Body>
      <Row>
        {UI_LANGUAGES.map((code) => (
          <Chip key={code} label={LANGUAGE_NAMES[code]} active={learning.includes(code)} onPress={() => setLearning(learning.includes(code) ? learning.filter((l) => l !== code) : [...learning, code])} />
        ))}
      </Row>
      <Button label={t.rooms.save} disabled={!ready} busy={saving} onPress={() => void save()} />
    </Card>
  );
}
