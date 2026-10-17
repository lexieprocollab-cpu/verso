import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";

export const MODEL = "claude-opus-5-5";

export class AiUnavailableError extends Error {
  constructor() {
    super("AI is not configured: set ANTHROPIC_API_KEY");
  }
}

export class AiRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super(`The model declined this request${category ? ` (${category})` : ""}`);
  }
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiUnavailableError();
  client ??= new Anthropic();
  return client;
}

// Small per-instance cache so repeated taps on the same word or line don't pay
// twice. The database cache (step 4) makes this shared across instances.
const MAX_CACHE = 500;
const cache = new Map<string, unknown>();

function remember<T>(key: string, value: T): T {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
  return value;
}

/**
 * One structured-output request: the response is validated against `schema`.
 * Uses server-side fallbacks so a safety decline is retried on the model
 * Anthropic recommends for that category instead of failing outright.
 */
export async function askJson<T>({
  task,
  system,
  prompt,
  schema,
  effort = "low",
  maxTokens = 4000,
  image,
}: {
  /** Cache namespace, e.g. "word". */
  task: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** A photo to look at, sent before the prompt. Answers about photos are not cached. */
  image?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };
}): Promise<T> {
  const cacheKey = image ? null : `${task}\n${prompt}`;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey) as T;

  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [
      {
        role: "user",
        content: image
          ? [
              { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
              { type: "text", text: prompt },
            ]
          : prompt,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new AiRefusalError(response.stop_details?.category ?? null);
  }
  if (response.parsed_output === null) {
    throw new Error(`Unparseable AI response (stop_reason: ${response.stop_reason})`);
  }
  const result = response.parsed_output as T;
  return cacheKey ? remember(cacheKey, result) : result;
}
