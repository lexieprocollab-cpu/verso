import { LANGUAGE_NAMES, UI_LANGUAGES, type UiLanguage } from "@shared/lib/i18n";
import { router } from "expo-router";
import { useState } from "react";
import { Body, Button, Chip, Field, Row, Screen, Title } from "../components/ui";
import { onboardingStore, updatePreferences } from "../lib/learner";
import { useSongs } from "../lib/songs";
import { usePreferences } from "../lib/usePreferences";

/** First launch: the language you speak, the one you learn, and up to 3 favorite songs. */
export default function Welcome() {
  const { t, lang } = usePreferences();
  const songs = useSongs();
  const [step, setStep] = useState(0);
  const [speak, setSpeak] = useState<UiLanguage>(lang);
  const [learn, setLearn] = useState<UiLanguage | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [wish, setWish] = useState("");

  function finish() {
    onboardingStore.set({ done: true, learn, favorites, wishes: wish.trim() ? [wish.trim().slice(0, 120)] : [] });
    router.replace("/");
  }

  return (
    <Screen>
      <Title>{t.onboarding.welcome}</Title>
      <Body muted>{t.onboarding.intro}</Body>
      {step === 0 && (
        <>
          <Body style={{ fontWeight: "700", marginTop: 8 }}>{t.onboarding.speak}</Body>
          <Row>
            {UI_LANGUAGES.map((code) => (
              <Chip
                key={code}
                label={LANGUAGE_NAMES[code]}
                active={speak === code}
                onPress={() => {
                  setSpeak(code);
                  updatePreferences({ lang: code, speak: code });
                }}
              />
            ))}
          </Row>
          <Button label={t.onboarding.next} onPress={() => setStep(1)} />
        </>
      )}
      {step === 1 && (
        <>
          <Body style={{ fontWeight: "700", marginTop: 8 }}>{t.onboarding.learn}</Body>
          <Row>
            {UI_LANGUAGES.filter((code) => code !== speak).map((code) => (
              <Chip key={code} label={LANGUAGE_NAMES[code]} active={learn === code} onPress={() => setLearn(code)} />
            ))}
          </Row>
          <Button label={t.onboarding.next} onPress={() => setStep(2)} disabled={!learn} />
          <Button kind="secondary" label={t.onboarding.back} onPress={() => setStep(0)} />
        </>
      )}
      {step === 2 && (
        <>
          <Body style={{ fontWeight: "700", marginTop: 8 }}>{t.onboarding.favorites}</Body>
          <Body muted>{t.onboarding.favoritesHint}</Body>
          <Row>
            {songs.map((song) => (
              <Chip
                key={song.id}
                label={song.title}
                active={favorites.includes(song.id)}
                onPress={() =>
                  setFavorites(favorites.includes(song.id) ? favorites.filter((id) => id !== song.id) : [...favorites, song.id].slice(-3))
                }
              />
            ))}
          </Row>
          <Field value={wish} onChangeText={setWish} placeholder={t.onboarding.typeSong} maxLength={120} />
          <Button label={t.onboarding.start} onPress={finish} />
          <Button kind="secondary" label={t.onboarding.back} onPress={() => setStep(1)} />
        </>
      )}
    </Screen>
  );
}
