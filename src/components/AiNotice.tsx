"use client";

import type { AiState } from "./useAi";
import type { AiTask } from "@/lib/ai/schemas";
import { usePreferences } from "./Preferences";

/** Loading and error line shared by every AI feature. */
export function AiNotice<T extends AiTask>({ state }: { state: AiState<T> }) {
  const { t } = usePreferences();
  if (state.status === "loading") return <p className="animate-pulse text-sm text-muted">✨ {t.ai.loading}</p>;
  if (state.status !== "error") return null;
  const message =
    state.reason === "not_configured" ? t.ai.unavailable : state.reason === "declined" ? t.ai.declined : t.ai.failed;
  return <p className="text-sm text-muted">{message}</p>;
}
