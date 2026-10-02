import { accessToken } from "@/lib/subscription";
import type { AiRequest, AiResponse, AiTask } from "./schemas";

export type AiOutcome<T extends AiTask> =
  | { ok: true; data: AiResponse<T> }
  | { ok: false; reason: AiFailure };

/** Why an AI call gave no answer. `limit` = today's AI requests are used up. */
export type AiFailure = "not_configured" | "declined" | "limit" | "failed";

/** Calls a Verso AI endpoint from the browser. Never throws. */
export async function callAi<T extends AiTask>(task: T, input: AiRequest<T>): Promise<AiOutcome<T>> {
  try {
    // Signed-in learners send their session so the server counts their own daily limit.
    const token = await accessToken().catch(() => null);
    const response = await fetch(`/api/ai/${task}`, {
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
