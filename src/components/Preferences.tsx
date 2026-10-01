"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import {
  DEFAULT_LANGUAGE,
  RTL_LANGUAGES,
  UI_LANGUAGES,
  dictionaries,
  directionOf,
  isUiLanguage,
  languageFromDevice,
  type UiLanguage,
} from "@/lib/i18n";
import { createLocalStore } from "@/lib/localStore";

export type Theme = "light" | "dark" | "system";

const LANG_KEY = "verso.lang";
const THEME_KEY = "verso.theme";

// Stored as plain strings (not JSON) so the boot script below can read them.
// Until the learner picks a language, the app follows the device's language.
const langStore = createLocalStore<UiLanguage>(
  LANG_KEY,
  DEFAULT_LANGUAGE,
  (raw) => (isUiLanguage(raw) ? raw : languageFromDevice(navigator.languages)),
  (value) => value,
);
const themeStore = createLocalStore<Theme>(
  THEME_KEY,
  "system",
  (raw) => (raw === "light" || raw === "dark" ? raw : "system"),
  (value) => value,
);

type PreferencesValue = {
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: (typeof dictionaries)[UiLanguage];
};

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const lang = langStore.useValue();
  const theme = themeStore.useValue();

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = directionOf(lang);
    if (theme === "system") root.removeAttribute("data-theme");
    else root.dataset.theme = theme;
  }, [lang, theme]);

  const value = useMemo(
    () => ({ lang, setLang: langStore.set, theme, setTheme: themeStore.set, t: dictionaries[lang] }),
    [lang, theme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}

/**
 * Runs before the first paint so a Hebrew reader never sees a left-to-right
 * flash and a dark-mode reader never sees a white flash.
 */
export const preferencesBootScript = `(() => {
  try {
    var l = localStorage.getItem("${LANG_KEY}");
    if (!l) {
      var supported = ${JSON.stringify(UI_LANGUAGES)};
      var device = navigator.languages || [];
      for (var i = 0; i < device.length && !l; i++) {
        var base = device[i].toLowerCase().split("-")[0];
        if (base === "iw") base = "he";
        if (supported.indexOf(base) >= 0) l = base;
      }
    }
    var t = localStorage.getItem("${THEME_KEY}");
    var r = document.documentElement;
    if (l) { r.lang = l; r.dir = ${JSON.stringify(RTL_LANGUAGES)}.indexOf(l) >= 0 ? "rtl" : "ltr"; }
    if (t === "light" || t === "dark") r.dataset.theme = t;
  } catch (e) {}
})();`;
