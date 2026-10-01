"use client";

import { promptInstall, useInstall } from "@/lib/install";
import { usePreferences } from "./Preferences";

/** Settings: install Verso on the home screen. */
export function InstallBox() {
  const { t } = usePreferences();
  const { canPrompt, installed, ios } = useInstall();
  return (
    <div>
      <p className="mb-2 font-medium">{t.install.title}</p>
      <div className="rounded-xl border border-border bg-surface p-4">
        {installed ? (
          <p className="text-sm">✓ {t.install.installed}</p>
        ) : canPrompt ? (
          <button type="button" onClick={() => void promptInstall()} className="w-full rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            📲 {t.install.button}
          </button>
        ) : (
          <p className="text-sm text-muted">{ios ? t.install.ios : t.install.other}</p>
        )}
      </div>
    </div>
  );
}
