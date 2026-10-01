import { describe, expect, it } from "vitest";
import { songAccess, statusFromStripe } from "./billing";

describe("free trial", () => {
  const base = { free: false, subscribed: false };

  it("opens the first three songs and numbers them", () => {
    expect(songAccess("a", { ...base, trialSongs: [] })).toEqual({ allowed: true, trialNumber: 1 });
    expect(songAccess("c", { ...base, trialSongs: ["a", "b"] })).toEqual({ allowed: true, trialNumber: 3 });
  });

  it("keeps started songs open and locks a fourth", () => {
    expect(songAccess("b", { ...base, trialSongs: ["a", "b", "c"] })).toEqual({ allowed: true, trialNumber: 2 });
    expect(songAccess("d", { ...base, trialSongs: ["a", "b", "c"] })).toEqual({ allowed: false });
  });

  it("never counts free songs or subscribers", () => {
    expect(songAccess("demo", { free: true, subscribed: false, trialSongs: ["a", "b", "c"] })).toEqual({
      allowed: true,
      trialNumber: null,
    });
    expect(songAccess("d", { free: false, subscribed: true, trialSongs: ["a", "b", "c"] })).toEqual({
      allowed: true,
      trialNumber: null,
    });
  });
});

describe("Stripe status", () => {
  it("maps Stripe statuses to Verso's", () => {
    expect(statusFromStripe("active")).toBe("active");
    expect(statusFromStripe("trialing")).toBe("active");
    expect(statusFromStripe("past_due")).toBe("past_due");
    expect(statusFromStripe("unpaid")).toBe("past_due");
    expect(statusFromStripe("canceled")).toBe("canceled");
    expect(statusFromStripe("incomplete_expired")).toBe("canceled");
  });
});
