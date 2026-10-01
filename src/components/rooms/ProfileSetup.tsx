"use client";

import { useState } from "react";
import { LANGUAGE_NAMES, UI_LANGUAGES, isUiLanguage, type UiLanguage } from "@/lib/i18n";
import { onboardingStore, playerSettingsStore } from "@/lib/learnerStores";
import { AVATARS, type OwnProfile, type RoomsBackend } from "@/lib/rooms/backend";
import { isOldEnough } from "@/lib/rooms/rules";
import { usePreferences } from "../Preferences";
import { ageLockStore } from "./useRooms";

const chip = (on: boolean) => `rounded-full border px-3 py-1.5 ${on ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"}`;

/** Name, avatar, birth month/year (age gate) and languages — needed before posting. */
export function ProfileSetup({ rooms, current, onSaved }: { rooms: RoomsBackend; current: OwnProfile | null; onSaved: () => void }) {
  const { t, lang } = usePreferences();
  const onboarding = onboardingStore.useValue();
  const { speak } = playerSettingsStore.useValue();
  const [thisYear] = useState(() => new Date().getFullYear());
  const [name, setName] = useState(current?.name ?? "");
  const [avatar, setAvatar] = useState(current?.avatar || AVATARS[0]);
  const [month, setMonth] = useState(current?.birthMonth ?? 0);
  const [year, setYear] = useState(current?.birthYear ?? 0);
  const [learning, setLearning] = useState<UiLanguage[]>(current?.learning.length ? current.learning : onboarding.learn ? [onboarding.learn] : []);
  const [speaks, setSpeaks] = useState<UiLanguage>(current?.speaks ?? speak ?? lang);
  const [saving, setSaving] = useState(false);

  const monthNames = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(lang, { month: "long" }).format(new Date(2000, i, 15)));
  const ready = name.trim().length > 0 && month > 0 && year > 0 && !saving;

  async function save() {
    setSaving(true);
    if (!isOldEnough(year, month, new Date())) ageLockStore.set(true);
    await rooms.saveProfile({
      name,
      avatar,
      birthYear: year,
      birthMonth: month,
      learning,
      speaks,
      favorites: onboarding.favorites.slice(0, 3),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <form
      className="space-y-5 rounded-2xl border border-border bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void save();
      }}
    >
      <h2 className="text-xl font-bold">{t.rooms.setupTitle}</h2>
      <label className="block">
        <span className="mb-1 block font-medium">{t.rooms.name}</span>
        <input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-border bg-bg px-4 py-3"
        />
      </label>

      <fieldset>
        <legend className="mb-1 font-medium">{t.rooms.avatar}</legend>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button key={a} type="button" aria-pressed={avatar === a} onClick={() => setAvatar(a)} className={`${chip(avatar === a)} text-xl`}>
              {a}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-medium">{t.rooms.birth}</legend>
        <p className="mb-2 text-sm text-muted">{t.rooms.birthWhy}</p>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label={t.rooms.month} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-xl border border-border bg-bg px-3 py-3">
            <option value={0}>{t.rooms.month}</option>
            {monthNames.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select aria-label={t.rooms.year} value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border border-border bg-bg px-3 py-3">
            <option value={0}>{t.rooms.year}</option>
            {Array.from({ length: 100 }, (_, i) => thisYear - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block font-medium">{t.rooms.speaks}</span>
        <select
          value={speaks}
          onChange={(e) => isUiLanguage(e.target.value) && setSpeaks(e.target.value)}
          className="w-full rounded-xl border border-border bg-bg px-3 py-3"
        >
          {UI_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="mb-1 font-medium">{t.rooms.learning}</legend>
        <div className="flex flex-wrap gap-2">
          {UI_LANGUAGES.map((code) => {
            const on = learning.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                onClick={() => setLearning(on ? learning.filter((l) => l !== code) : [...learning, code])}
                className={chip(on)}
              >
                {LANGUAGE_NAMES[code]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button type="submit" disabled={!ready} className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50">
        {t.rooms.save}
      </button>
    </form>
  );
}
