import { describe, expect, it } from "vitest";
import { activeMembers, needsResync, parsePartyMessage, positionNow } from "./party";

describe("listening party sync", () => {
  it("moves the host's position forward with the guest's own clock", () => {
    const anchor = { position: 10, playing: true, receivedAt: 5_000 };
    expect(positionNow(anchor, 7_500, 200)).toBe(12.5);
    expect(positionNow({ ...anchor, playing: false }, 7_500, 200)).toBe(10);
    expect(positionNow(anchor, 1_000_000, 200)).toBe(200);
  });

  it("resyncs only on real drift", () => {
    expect(needsResync(12.3, 12.5)).toBe(false);
    expect(needsResync(11, 12.5)).toBe(true);
  });

  it("counts people heard from recently", () => {
    expect(activeMembers({ a: { name: "A", seenAt: 1000 }, b: { name: "B", seenAt: 9000 } }, 12_000)).toEqual(["b"]);
  });

  it("accepts only well-formed messages", () => {
    expect(parsePartyMessage({ type: "state", from: "a", name: "Ana", position: 3, playing: true })).toEqual({
      type: "state",
      from: "a",
      name: "Ana",
      position: 3,
      playing: true,
    });
    expect(parsePartyMessage({ type: "react", from: "a", emoji: "🔥" })).toMatchObject({ emoji: "🔥" });
    expect(parsePartyMessage({ type: "react", from: "a", emoji: "<script>" })).toBeNull();
    expect(parsePartyMessage({ type: "state", from: "a", position: -1, playing: true })).toBeNull();
    expect(parsePartyMessage({ type: "state", from: "a", position: Number.NaN, playing: true })).toBeNull();
    expect(parsePartyMessage({ type: "wipe", from: "a" })).toBeNull();
    expect(parsePartyMessage("hello")).toBeNull();
    expect(parsePartyMessage({ type: "ping", from: "x".repeat(81) })).toBeNull();
  });
});
