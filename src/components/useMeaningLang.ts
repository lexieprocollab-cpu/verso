"use client";

import type { UiLanguage } from "@/lib/i18n";
import { playerSettingsStore } from "@/lib/learnerStores";
import { usePreferences } from "./Preferences";

/**
 * Language that translations and meanings are shown in: the learner's
 * "I speak" choice, else the interface language. Null when it equals the
 * language being learned (nothing to translate).
 */
export function useMeaningLang(learnLang: UiLanguage): UiLanguage | null {
  const { lang } = usePreferences();
  const { speak } = playerSettingsStore.useValue();
  const meaning = speak ?? lang;
  return meaning === learnLang ? null : meaning;
}
