import { beforeEach, describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fakeSupabase";
import { findBuddies, moderationQueue, reportDirect, reportMessage, resolveReport, sendDirect, sendMessage, utcDay, voteForEntry } from "./rooms";

const ANA = "user-ana";
const BEN = "user-ben";
const KID = "user-kid";
const TEEN = "user-teen";

function setup() {
  const thisYear = new Date().getFullYear();
  return fakeSupabase({
    profiles: [
      { id: ANA, display_name: "Ana", birth_year: 1995, birth_month: 3 },
      { id: BEN, display_name: "Ben", birth_year: 2000, birth_month: 7 },
      { id: KID, display_name: "Kid", birth_year: thisYear - 10, birth_month: 1 },
      { id: TEEN, display_name: "Teen", birth_year: thisYear - 15, birth_month: 1, speak_language: "fr", learning: ["en"] },
      { id: "no-profile" },
    ],
    bans: [],
    lyric_lines: [
      { song_id: "sea", text: "I walked my dog down to the sea" },
      { song_id: "sea", text: "We sang a song we didn't know" },
    ],
    messages: [],
    room_members: [],
    reports: [],
    message_votes: [],
    direct_messages: [],
    follows: [],
    blocks: [],
  });
}

let world = setup();
beforeEach(() => {
  world = setup();
});

const send = (user: string, body: string, mode: "free" | "song" = "free", challenge = false) =>
  sendMessage(world.db, user, { songId: "sea", body, mode, challenge });

describe("sending messages", () => {
  it("stores a valid message and joins the room", async () => {
    const result = await send(ANA, "we sang to the sea", "song");
    expect(result.ok).toBe(true);
    expect(world.tables.messages).toHaveLength(1);
    expect(world.tables.messages[0]).toMatchObject({ user_id: ANA, body: "we sang to the sea", mode: "song", challenge_day: null });
    expect(world.tables.room_members).toEqual([{ song_id: "sea", user_id: ANA }]);
  });

  it("enforces song-words-only mode and the profanity filter", async () => {
    expect(await send(ANA, "I love pizza", "song")).toEqual({ ok: false, error: "outside_words" });
    expect(await send(ANA, "I love pizza", "free")).toMatchObject({ ok: true });
    expect(await send(ANA, "this is shit")).toEqual({ ok: false, error: "blocked_word" });
  });

  it("requires a profile, age 13+, and no ban", async () => {
    expect(await send("no-profile", "hello")).toEqual({ ok: false, error: "profile_needed" });
    expect(await send(KID, "hello")).toEqual({ ok: false, error: "too_young" });
    world.tables.bans.push({ user_id: BEN, until: new Date(Date.now() + 86_400_000).toISOString() });
    expect(await send(BEN, "hello")).toEqual({ ok: false, error: "banned" });
    world.tables.bans[0].until = new Date(Date.now() - 1000).toISOString();
    expect(await send(BEN, "hello")).toMatchObject({ ok: true });
  });

  it("refuses rooms without lyrics", async () => {
    expect(await sendMessage(world.db, ANA, { songId: "nope", body: "hi", mode: "free", challenge: false })).toEqual({
      ok: false,
      error: "no_room",
    });
  });

  it("marks challenge entries with today's date", async () => {
    await send(ANA, "we sang a song", "song", true);
    expect(world.tables.messages[0].challenge_day).toBe(utcDay());
  });
});

describe("reports and moderation", () => {
  it("hides a reported message until a moderator decides", async () => {
    await send(BEN, "hello there");
    const id = world.tables.messages[0].id as number;
    expect(await reportMessage(world.db, BEN, id)).toEqual({ ok: false, error: "not_allowed" }); // own message
    expect(await reportMessage(world.db, ANA, id, "rude")).toEqual({ ok: true, data: null });
    expect(world.tables.messages[0].hidden).toBe(true);
    expect(world.tables.reports).toMatchObject([{ message_id: id, reporter: ANA, reason: "rude" }]);

    await resolveReport(world.db, id, "restore", 0);
    expect(world.tables.messages[0].hidden).toBe(false);
    expect(world.tables.reports[0].resolution).toBe("restored");
  });

  it("removes a message and bans its author", async () => {
    await send(BEN, "hello there");
    const id = world.tables.messages[0].id as number;
    await reportMessage(world.db, ANA, id);
    await resolveReport(world.db, id, "remove", 7);
    expect(world.tables.messages).toHaveLength(0);
    expect(world.tables.bans[0]).toMatchObject({ user_id: BEN });
    expect(await send(BEN, "hello again")).toEqual({ ok: false, error: "banned" });
  });
});

describe("challenge votes", () => {
  it("counts one vote per learner, never your own, today only", async () => {
    await send(BEN, "we sang a song", "song", true);
    const id = world.tables.messages[0].id as number;
    expect(await voteForEntry(world.db, BEN, id)).toEqual({ ok: false, error: "not_allowed" });
    expect(await voteForEntry(world.db, ANA, id)).toEqual({ ok: true, data: null });
    await voteForEntry(world.db, ANA, id);
    expect(world.tables.message_votes).toHaveLength(1);

    world.tables.messages[0].challenge_day = "2020-01-01";
    expect(await voteForEntry(world.db, ANA, id)).toEqual({ ok: false, error: "not_allowed" });
  });
});

describe("private messages", () => {
  const dm = (from: string, to: string, body = "hello") => sendDirect(world.db, from, { to, body });

  it("lets adults message each other, with the profanity filter", async () => {
    expect(await dm(ANA, BEN)).toMatchObject({ ok: true });
    expect(world.tables.direct_messages[0]).toMatchObject({ sender: ANA, recipient: BEN, body: "hello" });
    expect(await dm(ANA, BEN, "you shit")).toEqual({ ok: false, error: "blocked_word" });
    expect(await dm(ANA, ANA)).toEqual({ ok: false, error: "not_allowed" });
    expect(await dm(ANA, KID)).toEqual({ ok: false, error: "not_allowed" });
  });

  it("lets a minor message an adult only after following them", async () => {
    expect(await dm(TEEN, ANA)).toEqual({ ok: false, error: "follow_needed" });
    expect(await dm(ANA, TEEN)).toEqual({ ok: false, error: "not_allowed" });
    world.tables.follows.push({ follower: TEEN, followee: ANA });
    expect(await dm(TEEN, ANA)).toMatchObject({ ok: true });
    expect(await dm(ANA, TEEN)).toMatchObject({ ok: true });
  });

  it("refuses when either person blocked the other", async () => {
    world.tables.blocks.push({ blocker: BEN, blocked: ANA });
    expect(await dm(ANA, BEN)).toEqual({ ok: false, error: "blocked" });
    expect(await dm(BEN, ANA)).toEqual({ ok: false, error: "blocked" });
  });

  it("lets only the recipient report, and moderators see it", async () => {
    await dm(BEN, ANA, "rude words");
    const id = world.tables.direct_messages[0].id as number;
    expect(await reportDirect(world.db, BEN, id)).toEqual({ ok: false, error: "not_allowed" });
    expect(await reportDirect(world.db, ANA, id)).toEqual({ ok: true, data: null });
    expect(world.tables.direct_messages[0].hidden).toBe(true);
    expect(await moderationQueue(world.db)).toMatchObject([{ kind: "direct", messageId: id, body: "rude words", authorId: BEN }]);
    await resolveReport(world.db, id, "remove", 7, "direct");
    expect(world.tables.direct_messages).toHaveLength(0);
    expect(world.tables.bans[0]).toMatchObject({ user_id: BEN });
  });
});

describe("buddies", () => {
  it("matches within the age group and skips blocked people", async () => {
    const profiles = world.tables.profiles;
    Object.assign(profiles[0], { speak_language: "he", learning: ["fr"] }); // Ana
    Object.assign(profiles[1], { speak_language: "fr", learning: ["he"] }); // Ben
    const result = await findBuddies(world.db, ANA);
    expect(result).toMatchObject({ ok: true, data: [{ id: BEN, name: "Ben", mutual: true }] });
    world.tables.blocks.push({ blocker: BEN, blocked: ANA });
    expect(await findBuddies(world.db, ANA)).toEqual({ ok: true, data: [] });
    expect(await findBuddies(world.db, KID)).toEqual({ ok: false, error: "too_young" });
  });
});
