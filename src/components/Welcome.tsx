"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGE_NAMES, UI_LANGUAGES, directionOf, type UiLanguage } from "@/lib/i18n";
import { onboardingStore, updatePlayerSettings } from "@/lib/learnerStores";
import { track } from "@/lib/track";
import { usePreferences } from "./Preferences";
import { useSongs } from "./useSongs";

const MAX_FAVORITES = 3;

/** First visit: which language you speak, which you learn, and up to 3 favorite songs. */
export function Welcome() {
  const { t, lang, setLang } = usePreferences();
  const router = useRouter();
  const songs = useSongs();
  const [step, setStep] = useState(0);
  const [learn, setLearn] = useState<UiLanguage | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [wishes, setWishes] = useState(["", "", ""]);

  const picked = favorites.length + wishes.filter((w) => w.trim()).length;

  function finish() {
    const typed = wishes.map((w) => w.trim()).filter(Boolean);
    onboardingStore.set({ done: true, learn, favorites, wishes: typed });
    updatePlayerSettings({ speak: lang });
    track("onboarding_completed", {
      speak: lang,
      learn: learn ?? "none",
      favorites: favorites.length,
      ...Object.fromEntries(typed.map((wish, i) => [`wish${i + 1}`, wish.slice(0, 120)])),
    });
    router.replace("/");
  }

  const choice = (active: boolean) =>
    `rounded-2xl border-2 px-4 py-4 text-start text-lg font-semibold ${active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"}`;

  return (
    <section className="mx-auto max-w-lg pt-6 pb-10">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-border"}`} />
        ))}
      </div>

      {step === 0 && (
        <>
          <h1 className="mt-8 text-3xl font-bold">{t.onboarding.welcome}</h1>
          <p className="mt-2 text-muted">{t.onboarding.intro}</p>
          <h2 className="mt-8 text-xl font-semibold">{t.onboarding.speak}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {UI_LANGUAGES.map((code) => (
              <button key={code} type="button" onClick={() => setLang(code)} aria-pressed={lang === code} className={choice(lang === code)}>
                <span dir={directionOf(code)}>{LANGUAGE_NAMES[code]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="mt-8 text-2xl font-bold">{t.onboarding.learn}</h1>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {UI_LANGUAGES.filter((code) => code !== lang).map((code) => (
              <button key={code} type="button" onClick={() => setLearn(code)} aria-pressed={learn === code} className={choice(learn === code)}>
                <span dir={directionOf(code)}>{LANGUAGE_NAMES[code]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="mt-8 text-2xl font-bold">{t.onboarding.favorites}</h1>
          <p className="mt-2 text-sm text-muted">{t.onboarding.favoritesHint}</p>
          <div className="mt-4 grid gap-2">
            {songs.map((song) => {
              const active = favorites.includes(song.id);
              return (
                <button
                  key={song.id}
                  type="button"
                  aria-pressed={active}
                  disabled={!active && picked >= MAX_FAVORITES}
                  onClick={() => setFavorites(active ? favorites.filter((id) => id !== song.id) : [...favorites, song.id])}
                  className={`${choice(active)} disabled:opacity-40`}
                >
                  <span dir="ltr">
                    {active ? "♥ " : "♡ "}
                    {song.title} <span className="text-sm font-normal text-muted">· {song.artist}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-2">
            {wishes.map((wish, i) => (
              <input
                key={i}
                value={wish}
                maxLength={120}
                disabled={!wish && picked >= MAX_FAVORITES}
                onChange={(e) => setWishes(wishes.map((w, j) => (j === i ? e.target.value : w)))}
                placeholder={`${i + 1}. ${t.onboarding.typeSong}`}
                aria-label={`${t.onboarding.typeSong} ${i + 1}`}
                className="rounded-xl border border-border bg-surface px-4 py-3 disabled:opacity-40"
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-8 flex gap-2">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="rounded-xl border border-border px-5 py-3 font-medium">
            {t.onboarding.back}
          </button>
        )}
        {step < 2 ? (
          <button
            type="button"
            disabled={step === 1 && !learn}
            onClick={() => setStep(step + 1)}
            className="flex-1 rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-40"
          >
            {t.onboarding.next}
          </button>
        ) : (
          <button type="button" onClick={finish} className="flex-1 rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            {t.onboarding.start}
          </button>
        )}
      </div>
      {step === 2 && picked === 0 && (
        <button type="button" onClick={finish} className="mt-3 w-full text-sm text-muted">
          {t.onboarding.skip}
        </button>
      )}
      <p className="mt-8 flex justify-center gap-4 text-xs text-muted">
        <Link href="/privacy" className="underline">
          {t.account.privacy}
        </Link>
        <Link href="/terms" className="underline">
          {t.account.terms}
        </Link>
      </p>
    </section>
  );
}
