import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake admin client whose take_ai_request answer each test chooses.
const calls: { subject: string; limit: number }[] = [];
let rpcResult: { data: unknown; error: { message: string } | null } = {
  data: true,
  error: null,
};
let signedInUser: { id: string } | null = null;
let adminAvailable = true;
const fakeAdmin = {
  rpc: async (_name: string, args: { p_subject: string; p_limit: number }) => {
    calls.push({ subject: args.p_subject, limit: args.p_limit });
    return rpcResult;
  },
};
vi.mock("@/lib/server/supabaseAdmin", () => ({
  getSupabaseAdmin: () => (adminAvailable ? fakeAdmin : null),
  userFromRequest: async () => signedInUser,
}));
vi.mock("@/lib/ai/tasks", () => ({
  runAiTask: async () => ({ meaning: "chien" }),
}));

const { takeAiRequest, guestSubject, clientIp, DEFAULT_DAILY_LIMITS } = await import("./aiLimits");
const { POST } = await import("@/app/api/ai/[task]/route");

const request = (headers: Record<string, string> = {}) => new Request("http://verso.test/api/ai/word", { method: "POST", headers });

beforeEach(() => {
  calls.length = 0;
  rpcResult = { data: true, error: null };
  signedInUser = null;
  adminAvailable = true;
  vi.unstubAllEnvs();
});

describe("AI daily limits", () => {
  it("counts signed-in learners by their id with the learner limit", async () => {
    signedInUser = { id: "u1" };
    expect(await takeAiRequest(request())).toBe(true);
    expect(calls).toEqual([{ subject: "user:u1", limit: DEFAULT_DAILY_LIMITS.user }]);
  });

  it("counts guests by a hash of their address, never the raw IP", async () => {
    await takeAiRequest(request({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(calls[0].subject).toBe(guestSubject("203.0.113.7", ""));
    expect(calls[0].subject).not.toContain("203.0.113.7");
    expect(calls[0].limit).toBe(DEFAULT_DAILY_LIMITS.guest);
  });

  it("takes limits from the environment", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_GUEST", "5");
    await takeAiRequest(request());
    expect(calls[0].limit).toBe(5);
  });

  it("refuses once the database says the limit is used up", async () => {
    rpcResult = { data: false, error: null };
    expect(await takeAiRequest(request())).toBe(false);
  });

  it("allows requests when limits cannot be counted", async () => {
    rpcResult = {
      data: null,
      error: { message: "function public.take_ai_request does not exist" },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await takeAiRequest(request())).toBe(true);
    adminAvailable = false;
    expect(await takeAiRequest(request())).toBe(true);
  });

  it("reads the client address from the proxy headers", () => {
    expect(clientIp(request({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientIp(request({ "x-real-ip": "198.51.100.3" }))).toBe("198.51.100.3");
    expect(guestSubject("1.2.3.4", "a")).not.toBe(guestSubject("1.2.3.4", "b"));
  });

  it("the AI endpoint answers 429 at the limit and does not run the task", async () => {
    rpcResult = { data: false, error: null };
    const body = JSON.stringify({
      word: "chien",
      line: "J'ai promené mon chien",
      learn: "fr",
      meaning: "en",
    });
    const response = await POST(
      new Request("http://verso.test/api/ai/word", {
        method: "POST",
        body,
      }) as never,
      {
        params: Promise.resolve({ task: "word" }),
      },
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "daily_limit" });
  });

  it("bad requests are refused before they count", async () => {
    const response = await POST(
      new Request("http://verso.test/api/ai/word", {
        method: "POST",
        body: "{}",
      }) as never,
      {
        params: Promise.resolve({ task: "word" }),
      },
    );
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
