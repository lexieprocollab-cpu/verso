"use client";

import { useCallback, useState } from "react";
import { callAi } from "@/lib/ai/client";
import type { AiRequest, AiResponse, AiTask } from "@/lib/ai/schemas";

export type AiState<T extends AiTask> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: AiResponse<T> }
  | { status: "error"; reason: "not_configured" | "declined" | "failed" };

/** Runs one AI task on demand and tracks its state for the UI. */
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
