"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { callAi, type AiFailure } from "@/lib/ai/client";
import type { PhotoResult } from "@/lib/ai/schemas";
import { LANGUAGE_NAMES, UI_LANGUAGES, aiFailureText, directionOf, isUiLanguage, type UiLanguage } from "@/lib/i18n";
import { onboardingStore, photoWordsStore, playerSettingsStore, savePhotoWord, speak } from "@/lib/learnerStores";
import { PHOTO_MAX_SIDE, fitWithin, itemLanguage, markerPosition, photoWordId } from "@/lib/photoWords";
import { SPEECH_LANG } from "@/lib/song";
import { track } from "@/lib/track";
import { usePreferences } from "./Preferences";

type Item = PhotoResult["items"][number];
type State =
  | { status: "idle" }
  | { status: "looking"; url: string }
  | { status: "done"; url: string; items: Item[]; learn: UiLanguage; meaning: UiLanguage }
  | { status: "error"; url: string | null; reason: AiFailure | "unreadable" };

/** Scales the picture down to PHOTO_MAX_SIDE and encodes it as JPEG, so uploads stay small (~150 KB). */
async function shrink(file: File): Promise<{ url: string; base64: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  // Transparent images (PNG screenshots) get a white background instead of black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.8);
  return { url, base64: url.slice(url.indexOf(",") + 1) };
}

/**
 * Snap & learn: take a photo or upload any picture; the AI names everything in it, things and
 * writing, with the transcription, meaning, definition and an example. Tap one to hear it and
 * save it for review.
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
  const [dragging, setDragging] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const busy = state.status === "looking";

  async function learnFrom(file: File) {
    if (busy || !file.type.startsWith("image/")) return;
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

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void learnFrom(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void learnFrom(file);
  }

  // Pasting a picture (e.g. a screenshot) anywhere on the page works too.
  const learnFromRef = useRef(learnFrom);
  useEffect(() => {
    learnFromRef.current = learnFrom;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) void learnFromRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const url = state.status === "idle" ? null : state.url;
  const items = state.status === "done" ? state.items : [];
  const item = selected !== null ? items[selected] : undefined;

  return (
    <section
      className="pt-4 pb-10"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <h1 className="text-3xl font-bold">{t.photo.title}</h1>
      <p className="mt-2 text-muted">{t.photo.intro}</p>

      <label className="mt-4 flex items-center gap-2 text-sm">
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

      {/* The camera input opens the camera on phones; the upload input opens files and the photo library. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={onFile} className="sr-only" aria-hidden="true" tabIndex={-1} />
      <input ref={upload} type="file" accept="image/*" onChange={onFile} className="sr-only" aria-hidden="true" tabIndex={-1} />
      <div
        className={`mt-3 rounded-2xl border-2 border-dashed p-3 ${dragging ? "border-accent bg-accent-soft" : "border-transparent"}`}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => camera.current?.click()}
            disabled={busy}
            className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {t.photo.camera}
          </button>
          <button
            type="button"
            onClick={() => upload.current?.click()}
            disabled={busy}
            className="rounded-xl border border-border px-4 py-2.5 font-semibold disabled:opacity-60"
          >
            {t.photo.upload}
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">{t.photo.dropHint}</p>
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
              className={`absolute -translate-x-1/2 -translate-y-1/2 border-2 border-white px-2.5 py-1 text-sm font-semibold shadow-lg ${
                it.kind === "text" ? "rounded-md" : "rounded-full"
              } ${selected === i ? "bg-accent text-white" : "bg-black/60 text-white"}`}
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

      {state.status === "done" && item && <WordPanel item={item} learn={itemLanguage(item, state.learn)} exampleLang={state.learn} meaning={state.meaning} />}

      {state.status === "done" && items.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-bold">{t.photo.everything}</h2>
          <ol className="mt-3 grid gap-2">
            {items.map((it, i) => {
              const itemLang = itemLanguage(it, state.learn);
              return (
                <li key={`${it.word}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-pressed={selected === i}
                    className={`w-full rounded-xl border p-3 text-start ${selected === i ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm text-muted">{i + 1}.</span>
                      <span className="text-lg font-semibold" dir={directionOf(itemLang)}>
                        {it.word}
                      </span>
                      {it.ipa && (
                        <span className="text-sm text-muted" dir="ltr">
                          {it.ipa}
                        </span>
                      )}
                      {it.kind === "text" && <span className="rounded-full border border-border px-2 text-xs text-muted">{t.photo.written}</span>}
                    </span>
                    <span className="mt-1 block" dir={directionOf(state.meaning)}>
                      <span className="font-medium">{it.meaning}</span>
                      <span className="text-muted"> · {it.definition}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <p className="mt-6 text-xs text-muted">{t.photo.privacy}</p>
    </section>
  );
}

/** `learn` is the word's language; examples are always in the language being learned (`exampleLang`). */
function WordPanel({ item, learn, exampleLang, meaning }: { item: Item; learn: UiLanguage; exampleLang: UiLanguage; meaning: UiLanguage }) {
  const { t } = usePreferences();
  const saved = photoWordsStore.useValue().some((w) => w.id === photoWordId(learn, item.word));
  const learnDir = directionOf(learn);
  const meaningDir = directionOf(meaning);

  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface p-5" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0" dir={learnDir}>
          {item.kind === "text" && <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t.photo.written}</p>}
          <p className="text-3xl font-bold">{item.word}</p>
          {(item.ipa || item.reading) && (
            <p className="mt-1 text-muted" dir="ltr">
              {[item.ipa, item.reading].filter(Boolean).join("  ·  ")}
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
          <p className="mt-1 flex items-start gap-2" dir={directionOf(exampleLang)}>
            <button
              type="button"
              onClick={() => speak(item.example, SPEECH_LANG[exampleLang], 0.85)}
              aria-label={`${t.player.listen}: ${item.example}`}
              className="shrink-0"
            >
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
            ipa: item.ipa,
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
