import { describe, expect, it } from "vitest";
import { directMessageRule, matchBuddy, rankBuddies } from "./buddies";

const me = { id: "me", speaks: "he" as const, learning: ["fr" as const], favorites: ["sea"], adult: true };

describe("language buddies", () => {
  it("ranks a perfect match (each speaks what the other learns) first", () => {
    const helper = { id: "a", speaks: "fr" as const, learning: ["es" as const], favorites: [], adult: true };
    const perfect = { id: "b", speaks: "fr" as const, learning: ["he" as const], favorites: [], adult: true };
    const learner = { id: "c", speaks: "en" as const, learning: ["he" as const], favorites: ["sea"], adult: true };
    const nobody = { id: "d", speaks: "ru" as const, learning: ["es" as const], favorites: [], adult: true };
    const ranked = rankBuddies(me, [helper, perfect, learner, nobody]);
    expect(ranked.map((r) => r.profile.id)).toEqual(["b", "a", "c"]);
    expect(ranked[0].match).toMatchObject({ mutual: true, helps: true });
    expect(matchBuddy(me, { ...me })).toBeNull();
  });

  it("matches minors only with minors", () => {
    const teen = { id: "t", speaks: "fr" as const, learning: ["he" as const], favorites: [], adult: false };
    expect(rankBuddies(me, [teen])).toEqual([]);
    expect(rankBuddies({ ...me, adult: false }, [teen])).toHaveLength(1);
  });
});

describe("private message rule", () => {
  const base = { senderAdult: true, recipientAdult: true, minorFollowsAdult: false, blockedEitherWay: false };
  it("lets adults and minors talk within their group", () => {
    expect(directMessageRule(base)).toBe("ok");
    expect(directMessageRule({ ...base, senderAdult: false, recipientAdult: false })).toBe("ok");
  });
  it("lets a minor message an adult only after following them", () => {
    expect(directMessageRule({ ...base, senderAdult: false })).toBe("follow_needed");
    expect(directMessageRule({ ...base, senderAdult: false, minorFollowsAdult: true })).toBe("ok");
    expect(directMessageRule({ ...base, recipientAdult: false })).toBe("not_allowed");
    expect(directMessageRule({ ...base, recipientAdult: false, minorFollowsAdult: true })).toBe("ok");
  });
  it("refuses when either person blocked the other", () => {
    expect(directMessageRule({ ...base, blockedEitherWay: true })).toBe("blocked");
  });
});
