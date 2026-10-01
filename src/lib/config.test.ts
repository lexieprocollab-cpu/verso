import { describe, expect, it } from "vitest";
import { serviceStatus } from "./config";

describe("serviceStatus", () => {
  it("reports nothing configured with empty env", () => {
    expect(serviceStatus({})).toEqual({ database: false, ai: false });
  });

  it("needs both Supabase values for the database", () => {
    expect(serviceStatus({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }).database).toBe(false);
    expect(
      serviceStatus({
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      }).database,
    ).toBe(true);
  });

  it("detects the Claude API key", () => {
    expect(serviceStatus({ ANTHROPIC_API_KEY: "sk-ant-test" }).ai).toBe(true);
  });
});
