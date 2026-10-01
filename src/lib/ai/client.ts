import type { AiRequest, AiResponse, AiTask } from "./schemas";

export type AiOutcome<T extends AiTask> =
  | { ok: true; data: AiResponse<T> }
  | { ok: false; reason: "not_configured" | "declined" | "failed" };

/** Calls a Verso AI endpoint from the browser. Never throws. */
export async function callAi<T extends AiTask>(task: T, input: AiRequest<T>): Promise<AiOutcome<T>> {
  try {
    const response = await fetch(`/api/ai/${task}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (response.ok) return { ok: true, data: (await response.json()) as AiResponse<T> };
    if (response.status === 503) return { ok: false, reason: "not_configured" };
    if (response.status === 422) return { ok: false, reason: "declined" };
    return { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
