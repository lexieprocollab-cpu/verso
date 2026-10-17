"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { callAi, type AiFailure } from "@/lib/ai/client";
import type { PhotoResult } from "@/lib/ai/schemas";
import { LANGUAGE_NAMES, UI_LANGUAGES, aiFailureText, directionOf, isUiLanguage, type UiLanguage } from "@/lib/i18n";
import { onboardingStore, photoWordsStore, playerSettingsStore, savePhotoWord, speak } from "@/lib/learnerStores";
import { PHOTO_MAX_SIDE, fitWithin, markerPosition, photoWordId } from "@/lib/photoWords";
import { SPEECH_LANG } from "@/lib/song";
import { track } from "@/lib/track";
import { usePreferences } from "./Preferences";

type Item = PhotoResult["items"][number];
type State =
  | { status: "idle" }
  | { status: "looking"; url: string }
  | { status: "done"; url: string; items: Item[]; learn: UiLanguage; meaning: UiLanguage }
  | { status: "error"; url: string | null; reason: AiFailure | "unreadable" };

/** Scales the photo down to PHOTO_MAX_SIDE and encodes it as JPEG, so uploads stay small (~150 KB). */
async function shrink(file: File): Promise<{ url: string; base64: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.8);
  return { url, base64: url.slice(url.indexOf(",") + 1) };
}

/**
 * Snap & learn: photograph anything, tap a dot on a thing, learn its word in
 * the language being learned with its meaning, a definition, an example and
 * pronunciation, and save it for review.
 */
export function PhotoLearn() {
  const { t, lang } = usePreferences();
  const onboarding = onboardingStore.useValue();
  const { speak: speakLang } = playerSettingsStore.useValue();
  // The onboarding choice loads after the first render, so the picked language is derived, not copied.
  const [picked, setLearn] = useState<UiLanguage | null>(null);
  const learn = picked ?? onboarding.learn ?? "en";
  const meaning = speakLang ?? lang;
  const [state, setState] = useState<State>({ status: "idle" });
  const [selected, setSelected] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSelected(null);
    let photo: { url: string; base64: string };
    try {
      photo = await shrink(file);
    } catch {
      return setState({ status: "error", url: null, reason: "unreadable" });
    }
    setState({ status: "looking", url: photo.url });
    track("photo_scanned", { learn });
    const outcome = await callAi("photo", { image: photo.base64, mediaType: "image/jpeg", learn, meaning });
    setState(
      outcome.ok
        ? { status: "done", url: photo.url, items: outcome.data.items, learn, meaning }
        : { status: "error", url: photo.url, reason: outcome.reason },
    );
  }

  const url = state.status === "idle" ? null : state.url;
  const items = state.status === "done" ? state.items : [];
  const item = selected !== null ? items[selected] : undefined;

  return (
    <section className="pt-4 pb-10">
      <h1 className="text-3xl font-bold">{t.photo.title}</h1>
      <p className="mt-2 text-muted">{t.photo.intro}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          {t.photo.learnIn}
          <select
            value={learn}
            onChange={(e) => isUiLanguage(e.target.value) && setLearn(e.target.value)}
            className="rounded-lg border border-border bg-bg px-2 py-1.5"
          >
            {UI_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>
        <input ref={input} type="file" accept="image/*" capture="environment" onChange={onFile} className="sr-only" aria-hidden="true" tabIndex={-1} />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={state.status === "looking"}
          className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {url ? t.photo.another : t.photo.take}
        </button>
      </div>

      {url && (
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, nothing to optimise */}
          <img src={url} alt="" className="block w-full" />
          {items.map((it, i) => (
            <button
              key={`${it.word}-${i}`}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={it.word}
              aria-pressed={selected === i}
              style={markerPosition(it)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white px-2.5 py-1 text-sm font-semibold shadow-lg ${
                selected === i ? "bg-accent text-white" : "bg-black/60 text-white"
              }`}
            >
              {selected === i ? it.word : i + 1}
            </button>
          ))}
        </div>
      )}

      {state.status === "looking" && <p className="mt-3 animate-pulse text-muted">✨ {t.photo.looking}</p>}
      {state.status === "error" && (
        <p className="mt-3 text-muted">{state.reason === "unreadable" ? t.photo.failed : aiFailureText(t, state.reason)}</p>
      )}
      {state.status === "done" && items.length === 0 && <p className="mt-3 text-muted">{t.photo.none}</p>}
      {state.status === "done" && items.length > 0 && !item && <p className="mt-3 text-muted">{t.photo.tapHint}</p>}

      {state.status === "done" && item && <WordPanel item={item} learn={state.learn} meaning={state.meaning} />}

      {state.status === "done" && items.length > 1 && (
        <ul className="mt-4 flex flex-wrap gap-2" dir={directionOf(state.learn)}>
          {items.map((it, i) => (
            <li key={`${it.word}-${i}`}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={`rounded-full border px-3 py-1.5 text-sm ${selected === i ? "border-accent bg-accent-soft" : "border-border"}`}
              >
                {i + 1}. {it.word}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-muted">{t.photo.privacy}</p>
    </section>
  );
}

function WordPanel({ item, learn, meaning }: { item: Item; learn: UiLanguage; meaning: UiLanguage }) {
  const { t } = usePreferences();
  const saved = photoWordsStore.useValue().some((w) => w.id === photoWordId(learn, item.word));
  const learnDir = directionOf(learn);
  const meaningDir = directionOf(meaning);

  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface p-5" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0" dir={learnDir}>
          <p className="text-3xl font-bold">{item.word}</p>
          {item.reading && (
            <p className="mt-1 text-sm text-muted" dir="ltr">
              {item.reading}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => speak(item.word, SPEECH_LANG[learn], 0.8)}
          className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-medium"
        >
          🔊 {t.player.listen}
        </button>
      </div>
      <p className="mt-3 text-xl" dir={meaningDir}>
        {item.meaning}
      </p>
      <p className="mt-3 text-sm" dir={meaningDir}>
        <span className="font-semibold">{t.photo.definition}:</span> {item.definition}
      </p>
      {item.example && (
        <div className="mt-3 text-sm">
          <p className="font-semibold">{t.photo.example}</p>
          <p className="mt-1 flex items-start gap-2" dir={learnDir}>
            <button type="button" onClick={() => speak(item.example, SPEECH_LANG[learn], 0.85)} aria-label={`${t.player.listen}: ${item.example}`} className="shrink-0">
              🔊
            </button>
            <span>{item.example}</span>
          </p>
          <p className="mt-1 text-muted" dir={meaningDir}>
            {item.example_meaning}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() =>
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
        disabled={saved}
        className={`mt-4 w-full rounded-xl px-4 py-3 font-semibold ${saved ? "bg-accent-soft text-accent" : "bg-accent text-white"}`}
      >
        {saved ? `♥ ${t.word.saved}` : `♡ ${t.word.save}`}
      </button>
    </div>
  );
}
