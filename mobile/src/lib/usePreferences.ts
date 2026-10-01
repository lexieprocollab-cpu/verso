import { dictionaries, directionOf, type UiLanguage } from "@shared/lib/i18n";
import { useColorScheme } from "react-native";
import { preferencesStore } from "./learner";

const LIGHT = { bg: "#fbf8f4", surface: "#ffffff", text: "#1c1a24", muted: "#6b6878", border: "#e7e2da", accent: "#6d4aff", accentSoft: "#ece6ff", good: "#15803d", bad: "#dc2626" };
const DARK = { bg: "#121118", surface: "#1b1a23", text: "#f2f0f7", muted: "#a19eb0", border: "#2d2b38", accent: "#9b82ff", accentSoft: "#2a2442", good: "#4ade80", bad: "#f87171" };
export type Colors = typeof LIGHT;

/** Interface language and dictionary (shared with the web app), settings and theme colors. */
export function usePreferences() {
  const prefs = preferencesStore.useValue();
  const scheme = useColorScheme();
  return {
    ...prefs,
    t: dictionaries[prefs.lang],
    rtl: directionOf(prefs.lang) === "rtl",
    colors: scheme === "dark" ? DARK : LIGHT,
    /** Language meanings are shown in: "I speak", else the interface language; null if it's the song's own. */
    meaningFor: (songLanguage: UiLanguage) => {
      const meaning = prefs.speak ?? prefs.lang;
      return meaning === songLanguage ? null : meaning;
    },
  };
}
