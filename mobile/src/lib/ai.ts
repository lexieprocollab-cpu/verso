import type { AiRequest, AiResponse, AiTask } from "@shared/lib/ai/schemas";
import { useCallback, useState } from "react";
import { API_URL } from "./config";
import { accessToken } from "./supabase";

/** Why an AI call gave no answer. `limit` = today's AI requests are used up. */
export type AiFailure = "not_configured" | "declined" | "limit" | "failed";

export type AiOutcome<T extends AiTask> = { ok: true; data: AiResponse<T> } | { ok: false; reason: AiFailure };

/** Calls the web app's AI endpoint (the Claude key stays on the server). Never throws. */
export async function callAi<T extends AiTask>(task: T, input: AiRequest<T>): Promise<AiOutcome<T>> {
  if (!API_URL) return { ok: false, reason: "not_configured" };
  try {
    // Signed-in learners send their session so the server counts their own daily limit.
    const token = await accessToken().catch(() => null);
    const response = await fetch(`${API_URL}/api/ai/${task}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(input),
    });
    if (response.ok) return { ok: true, data: (await response.json()) as AiResponse<T> };
    if (response.status === 503) return { ok: false, reason: "not_configured" };
    if (response.status === 422) return { ok: false, reason: "declined" };
    if (response.status === 429) return { ok: false, reason: "limit" };
    return { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export type AiState<T extends AiTask> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: AiResponse<T> }
  | { status: "error"; reason: AiFailure };

export function useAi<T extends AiTask>(task: T) {
  const [state, setState] = useState<AiState<T>>({ status: "idle" });
  const run = useCallback(
    async (input: AiRequest<T>) => {
      setState({ status: "loading" });
      const outcome = await callAi(task, input);
      const next: AiState<T> = outcome.ok ? { status: "done", data: outcome.data } : { status: "error", reason: outcome.reason };
      setState(next);
      return next;
    },
    [task],
  );
  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, run, reset };
}
