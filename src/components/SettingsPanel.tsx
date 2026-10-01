"use client";

import type { ServiceStatus } from "@/lib/config";
import { LANGUAGE_NAMES, UI_LANGUAGES, isUiLanguage } from "@/lib/i18n";
import { AccountBox } from "./AccountBox";
import { InstallBox } from "./InstallBox";
import { OfflineSongs } from "./OfflineSongs";
import { SubscriptionBox } from "./SubscriptionBox";
import { usePreferences, type Theme } from "./Preferences";

const THEMES: Theme[] = ["light", "dark", "system"];

export function SettingsPanel({ status }: { status: ServiceStatus }) {
  const { t, lang, setLang, theme, setTheme } = usePreferences();
  const themeLabel: Record<Theme, string> = { light: t.themeLight, dark: t.themeDark, system: t.themeSystem };

  return (
    <section className="space-y-8 pt-4">
      <h1 className="text-3xl font-bold">{t.settings}</h1>

      <div>
        <label htmlFor="ui-lang" className="mb-2 block font-medium">
          {t.interfaceLanguage}
        </label>
        <select
          id="ui-lang"
          value={lang}
          onChange={(e) => isUiLanguage(e.target.value) && setLang(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3"
        >
          {UI_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-2 font-medium">{t.theme}</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t.theme}>
          {THEMES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={theme === option}
              onClick={() => setTheme(option)}
              className={`rounded-xl border px-3 py-3 font-medium ${
                theme === option ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"
              }`}
            >
              {themeLabel[option]}
            </button>
          ))}
        </div>
      </div>

      <AccountBox enabled={status.database} />

      <SubscriptionBox />

      <OfflineSongs />

      <InstallBox />

      <div>
        <p className="mb-2 font-medium">{t.status.title}</p>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          <StatusRow label={t.status.database} ok={status.database} />
          <StatusRow label={t.status.ai} ok={status.ai} />
        </ul>
      </div>
    </section>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  const { t } = usePreferences();
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <span>{label}</span>
      <span className={`shrink-0 text-sm font-medium ${ok ? "text-green-600 dark:text-green-400" : "text-muted"}`}>
        {ok ? t.status.connected : t.status.notConfigured}
      </span>
    </li>
  );
}
