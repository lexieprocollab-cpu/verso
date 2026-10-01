import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake Anthropic client: records requests and returns queued responses.
const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { parse } };
  },
}));

const { POST } = await import("@/app/api/ai/[task]/route");

function call(task: string, body: unknown, headers: Record<string, string> = {}) {
  const request = new NextRequest(`http://verso.test/api/ai/${task}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "verso.test", ...headers },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ task }) });
}

const wordInput = { word: "smiled", line: "The sun was warm and smiled at me", learn: "en", meaning: "ru" };
const wordAnswer = { meaning: "улыбалось", lemma: "smile", note: "Past simple", hebrew_root: "" };

describe("AI endpoint", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    parse.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends a structured-output request to Claude Opus 5.5 with safety fallbacks", async () => {
    parse.mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: wordAnswer });
    const response = await call("word", wordInput);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(wordAnswer);

    const request = parse.mock.calls[0][0];
    expect(request.model).toBe("claude-opus-5-5");
    expect(request.fallbacks).toBe("default");
    expect(request.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(request.output_config.effort).toBe("low");
    expect(request.output_config.format).toBeDefined();
    expect(request.messages[0].content).toContain("smiled");
    expect(request.messages[0].content).toContain("Russian");
  });

  it("answers repeated questions from the cache", async () => {
    const input = { ...wordInput, word: "warm" };
    parse.mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: wordAnswer });
    await call("word", input);
    const second = await call("word", input);
    expect(await second.json()).toEqual(wordAnswer);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("reports a refusal as 422", async () => {
    parse.mockResolvedValueOnce({ stop_reason: "refusal", stop_details: { category: "cyber" }, parsed_output: null });
    const response = await call("explain", { line: "Hello there", learn: "en", meaning: "fr" });
    expect(response.status).toBe(422);
  });

  it("reports a missing API key as 503 without calling Claude", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await call("sentence", { words: ["dog"], learn: "en", meaning: "he" });
    expect(response.status).toBe(503);
    expect(parse).not.toHaveBeenCalled();
  });

  it("rejects unknown tasks, bad input and other websites", async () => {
    expect((await call("poem", wordInput)).status).toBe(404);
    expect((await call("word", { ...wordInput, learn: "it" })).status).toBe(400);
    expect((await call("word", { ...wordInput, word: "" })).status).toBe(400);
    expect((await call("word", wordInput, { origin: "https://evil.example" })).status).toBe(403);
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("AI tutor", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    parse.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends the conversation, the words to use and the level", async () => {
    const answer = { reply: "Do you like the sea?", translation: "Tu aimes la mer ?", has_mistake: true, corrected: "I walked my dog.", explanation: "Passé." };
    parse.mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: answer });
    const response = await call("tutor", {
      learn: "en",
      meaning: "fr",
      level: "easy",
      song: "Down to the Sea",
      words: ["dog", "sea", "walked"],
      history: [
        { role: "tutor", text: "What did you do today?" },
        { role: "learner", text: "I walk my dog." },
      ],
    });
    expect(await response.json()).toEqual(answer);
    const prompt: string = parse.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("dog, sea, walked");
    expect(prompt).toContain("Learner: I walk my dog.");
    expect(prompt).toContain("very simple");
    expect(parse.mock.calls[0][0].system).toContain("13");
  });

  it("lets the tutor open the conversation and caps the history", async () => {
    parse.mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: { reply: "Hi!", translation: "Salut !", has_mistake: false, corrected: "", explanation: "" } });
    expect((await call("tutor", { learn: "en", meaning: "fr", level: "hard", words: [], history: [] })).status).toBe(200);
    expect(parse.mock.calls[0][0].messages[0].content).toContain("Open the conversation");
    const long = Array.from({ length: 31 }, () => ({ role: "learner", text: "hi" }));
    expect((await call("tutor", { learn: "en", meaning: "fr", level: "easy", words: [], history: long })).status).toBe(400);
  });
});
