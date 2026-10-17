import type { PhotoResult } from "@shared/lib/ai/schemas";
import { LANGUAGE_NAMES, UI_LANGUAGES, aiFailureText, directionOf, type UiLanguage } from "@shared/lib/i18n";
import { PHOTO_MAX_SIDE, fitWithin, markerPosition, photoWordId } from "@shared/lib/photoWords";
import { SPEECH_LANG } from "@shared/lib/song";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Speech from "expo-speech";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue } from "react-native";
import { Body, Button, Card, Chip, Screen, Title } from "../components/ui";
import { callAi, type AiFailure } from "../lib/ai";
import { onboardingStore, photoWordsStore, savePhotoWord } from "../lib/learner";
import { usePreferences } from "../lib/usePreferences";

type Item = PhotoResult["items"][number];
type Photo = { uri: string; width: number; height: number };
type State =
  | { status: "idle" }
  | { status: "looking"; photo: Photo }
  | { status: "done"; photo: Photo; items: Item[]; learn: UiLanguage; meaning: UiLanguage }
  | { status: "error"; photo: Photo | null; reason: AiFailure | "unreadable" };

/** Scales the photo down to PHOTO_MAX_SIDE and encodes it as JPEG, so uploads stay small (~150 KB). */
async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<Photo & { base64: string }> {
  const size = fitWithin(asset.width, asset.height, PHOTO_MAX_SIDE);
  const image = await ImageManipulator.manipulate(asset.uri).resize(size).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error("no image data");
  return { uri: saved.uri, width: saved.width, height: saved.height, base64: saved.base64 };
}

/**
 * Snap & learn: photograph anything, tap a dot on a thing, learn its word in
 * the language being learned with its meaning, a definition, an example and
 * pronunciation, and save it for review.
 */
export default function PhotoLearn() {
  const { t, colors, speak, lang } = usePreferences();
  const onboarding = onboardingStore.useValue();
  const [picked, setPicked] = useState<UiLanguage | null>(null);
  const learn = picked ?? onboarding.learn ?? "en";
  const meaning = speak ?? lang;
  const [state, setState] = useState<State>({ status: "idle" });
  const [selected, setSelected] = useState<number | null>(null);

  async function pick(source: "camera" | "library") {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return pick("library");
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setSelected(null);
    let photo: Photo & { base64: string };
    try {
      photo = await shrink(asset);
    } catch {
      return setState({ status: "error", photo: null, reason: "unreadable" });
    }
    setState({ status: "looking", photo });
    const outcome = await callAi("photo", { image: photo.base64, mediaType: "image/jpeg", learn, meaning });
    setState(
      outcome.ok
        ? { status: "done", photo, items: outcome.data.items, learn, meaning }
        : { status: "error", photo, reason: outcome.reason },
    );
  }

  const photo = state.status === "idle" ? null : state.photo;
  const items = state.status === "done" ? state.items : [];
  const item = selected !== null ? items[selected] : undefined;

  return (
    <Screen>
      <Title>{t.photo.title}</Title>
      <Body muted>{t.photo.intro}</Body>

      <Body>{t.photo.learnIn}</Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langs}>
        {UI_LANGUAGES.map((code) => (
          <Chip key={code} label={LANGUAGE_NAMES[code]} active={learn === code} onPress={() => setPicked(code)} />
        ))}
      </ScrollView>

      <Button label={t.photo.camera} disabled={state.status === "looking"} onPress={() => void pick("camera")} />
      <Button kind="secondary" label={t.photo.choose} disabled={state.status === "looking"} onPress={() => void pick("library")} />

      {photo ? (
        <View style={[styles.photo, { aspectRatio: photo.width / photo.height, borderColor: colors.border }]}>
          <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
          {items.map((it, i) => {
            const pos = markerPosition(it);
            const active = selected === i;
            return (
              <Pressable
                key={`${it.word}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={it.word}
                accessibilityState={{ selected: active }}
                onPress={() => setSelected(i)}
                hitSlop={10}
                style={[
                  styles.marker,
                  { left: pos.left as DimensionValue, top: pos.top as DimensionValue, backgroundColor: active ? colors.accent : "rgba(0,0,0,0.6)" },
                ]}
              >
                <Text style={styles.markerText}>{i + 1}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {state.status === "looking" ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.accent} />
          <Body muted>✨ {t.photo.looking}</Body>
        </View>
      ) : null}
      {state.status === "error" ? <Body muted>{state.reason === "unreadable" ? t.photo.failed : aiFailureText(t, state.reason)}</Body> : null}
      {state.status === "done" && items.length === 0 ? <Body muted>{t.photo.none}</Body> : null}
      {state.status === "done" && items.length > 0 && !item ? <Body muted>{t.photo.tapHint}</Body> : null}

      {state.status === "done" && items.length > 0 ? (
        <View style={styles.chips}>
          {items.map((it, i) => (
            <Chip key={`${it.word}-${i}`} label={`${i + 1}. ${it.word}`} active={selected === i} onPress={() => setSelected(i)} />
          ))}
        </View>
      ) : null}

      {state.status === "done" && item ? <WordPanel item={item} learn={state.learn} meaning={state.meaning} /> : null}

      <Body muted style={{ fontSize: 12 }}>
        {t.photo.privacy}
      </Body>
    </Screen>
  );
}

function WordPanel({ item, learn, meaning }: { item: Item; learn: UiLanguage; meaning: UiLanguage }) {
  const { t, colors } = usePreferences();
  const saved = photoWordsStore.useValue().some((w) => w.id === photoWordId(learn, item.word));
  const learnAlign = directionOf(learn) === "rtl" ? "right" : "left";
  const meaningAlign = directionOf(meaning) === "rtl" ? "right" : "left";

  return (
    <Card>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.word, { color: colors.text, textAlign: learnAlign }]}>{item.word}</Text>
          {item.reading ? <Text style={{ color: colors.muted }}>{item.reading}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t.player.listen} onPress={() => Speech.speak(item.word, { language: SPEECH_LANG[learn], rate: 0.8 })}>
          <Text style={[styles.listen, { borderColor: colors.border, color: colors.text }]}>🔊 {t.player.listen}</Text>
        </Pressable>
      </View>
      <Text style={[styles.meaning, { color: colors.text, textAlign: meaningAlign }]}>{item.meaning}</Text>
      <Text style={{ color: colors.text, textAlign: meaningAlign }}>
        <Text style={{ fontWeight: "700" }}>{t.photo.definition}: </Text>
        {item.definition}
      </Text>
      {item.example ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>{t.photo.example}</Text>
          <Text
            accessibilityRole="button"
            accessibilityLabel={`${t.player.listen}: ${item.example}`}
            onPress={() => Speech.speak(item.example, { language: SPEECH_LANG[learn], rate: 0.85 })}
            style={{ color: colors.text, textAlign: learnAlign }}
          >
            🔊 {item.example}
          </Text>
          <Text style={{ color: colors.muted, textAlign: meaningAlign }}>{item.example_meaning}</Text>
        </View>
      ) : null}
      <Button
        label={saved ? `♥ ${t.word.saved}` : `♡ ${t.word.save}`}
        kind={saved ? "secondary" : "primary"}
        disabled={saved}
        onPress={() =>
          savePhotoWord({
            word: item.word,
            learn,
            meaningLang: meaning,
            reading: item.reading,
            meaning: item.meaning,
            definition: item.definition,
            example: item.example,
            exampleMeaning: item.example_meaning,
          })
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  langs: { gap: 8, paddingVertical: 4 },
  photo: { width: "100%", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  marker: {
    position: "absolute",
    width: 30,
    height: 30,
    marginLeft: -15,
    marginTop: -15,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  markerText: { color: "#fff", fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  word: { fontSize: 30, fontWeight: "800" },
  listen: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: "hidden" },
  meaning: { fontSize: 20 },
});
