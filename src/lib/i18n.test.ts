import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, UI_LANGUAGES, dictionaries, directionOf, isUiLanguage, languageFromDevice } from "./i18n";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe("i18n", () => {
  it("has a dictionary for every interface language", () => {
    for (const lang of UI_LANGUAGES) expect(dictionaries[lang]).toBeDefined();
  });

  it("every language has the same keys as English, none empty", () => {
    const english = keyPaths(dictionaries.en).sort();
    for (const lang of UI_LANGUAGES) {
      expect(keyPaths(dictionaries[lang]).sort()).toEqual(english);
      for (const path of english) {
        const text = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dictionaries[lang]);
        expect(text, `${lang}.${path}`).toBeTypeOf("string");
        expect((text as string).trim(), `${lang}.${path}`).not.toBe("");
      }
    }
  });

  it("Hebrew and Arabic are right-to-left, the rest left-to-right", () => {
    expect(directionOf("he")).toBe("rtl");
    expect(directionOf("ar")).toBe("rtl");
    for (const lang of UI_LANGUAGES.filter((l) => l !== "he" && l !== "ar")) expect(directionOf(lang)).toBe("ltr");
  });

  it("picks the first supported device language", () => {
    expect(languageFromDevice(["he-IL", "en-US"])).toBe("he");
    expect(languageFromDevice(["iw"])).toBe("he");
    expect(languageFromDevice(["it-IT", "uk-UA"])).toBe("uk");
    expect(languageFromDevice(["de-AT"])).toBe("de");
    expect(languageFromDevice(["ar-EG"])).toBe("ar");
    expect(languageFromDevice(["it-IT"])).toBe("en");
    expect(languageFromDevice([])).toBe("en");
  });

  it("validates language codes", () => {
    expect(isUiLanguage("ru")).toBe(true);
    expect(isUiLanguage("de")).toBe(true);
    expect(isUiLanguage("it")).toBe(false);
    expect(isUiLanguage(null)).toBe(false);
    expect(isUiLanguage(DEFAULT_LANGUAGE)).toBe(true);
  });
});
