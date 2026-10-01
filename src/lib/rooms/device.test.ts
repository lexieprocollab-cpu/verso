import { describe, expect, it } from "vitest";
import { demoSong } from "@/content/demoSong";
import { createDeviceRooms } from "./device";

function memoryStorage(entries: [string, string][] = []) {
  const data = new Map<string, string>(entries);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

const adult = { name: "Ana", avatar: "🎧", speaks: "fr" as const, learning: ["en" as const], favorites: [], birthYear: 1995, birthMonth: 3 };

function twoTabs() {
  const storage = memoryStorage();
  let id = 0;
  const env = { storage, newId: () => `id${++id}` };
  // A tab keeps the device's learner unless its sessionStorage names another one.
  const ana = createDeviceRooms({ ...env, session: memoryStorage() });
  const ben = createDeviceRooms({ ...env, session: memoryStorage([["verso.rooms.me", "device-ben"]]) });
  return { ana, ben };
}

describe("device Song Rooms", () => {
  it("gives each tab its own learner and shares the room", async () => {
    const { ana, ben } = twoTabs();
    expect(await ana.send(demoSong, "hello", "free", false)).toEqual({ ok: false, error: "profile_needed" });
    await ana.saveProfile(adult);
    await ben.saveProfile({ ...adult, name: "Ben" });
    expect(await ana.send(demoSong, "down to the sea", "song", false)).toEqual({ ok: true });
    expect(await ana.send(demoSong, "pizza time", "song", false)).toEqual({ ok: false, error: "outside_words" });

    const seen = await ben.messages(demoSong.id);
    expect(seen.map((m) => m.body)).toEqual(["down to the sea"]);
    expect((await ben.profiles([seen[0].userId]))[seen[0].userId].name).toBe("Ana");
    expect(await ben.memberCounts()).toEqual({ [demoSong.id]: 1 });
  });

  it("blocks under-13s, hides reported messages, and moderates", async () => {
    const { ana, ben } = twoTabs();
    await ana.saveProfile({ ...adult, birthYear: new Date().getFullYear() - 10 });
    expect(await ana.send(demoSong, "hi", "free", false)).toEqual({ ok: false, error: "too_young" });

    await ana.saveProfile(adult);
    await ben.saveProfile({ ...adult, name: "Ben" });
    await ana.send(demoSong, "hello there", "free", false);
    const [message] = await ben.messages(demoSong.id);
    expect(await ana.report(message.id)).toEqual({ ok: false, error: "not_allowed" });
    await ben.report(message.id);
    expect(await ana.messages(demoSong.id)).toEqual([]);

    expect((await ben.queue())?.map((i) => i.body)).toEqual(["hello there"]);
    await ben.resolve(message.id, "remove", 7, "room");
    expect(await ben.queue()).toEqual([]);
    expect(await ana.send(demoSong, "back again", "free", false)).toEqual({ ok: false, error: "banned" });
  });

  it("filters blocked learners and counts one vote per learner", async () => {
    const { ana, ben } = twoTabs();
    await ana.saveProfile(adult);
    await ben.saveProfile({ ...adult, name: "Ben" });
    await ana.send(demoSong, "down to the sea", "song", true);
    const [entry] = await ben.messages(demoSong.id);
    expect(entry.challengeDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(await ana.vote(entry.id)).toEqual({ ok: false, error: "not_allowed" });
    await ben.vote(entry.id);
    await ben.vote(entry.id);
    expect(await ana.votes(demoSong.id)).toHaveLength(1);

    await ben.setBlocked(entry.userId, true);
    expect(await ben.messages(demoSong.id)).toEqual([]);
    expect(await ben.blocked()).toEqual([entry.userId]);
    await ben.setFollowing(entry.userId, true);
    expect(await ben.following()).toEqual([entry.userId]);
  });
});

describe("device buddies and private messages", () => {
  it("matches buddies and keeps the minor-to-adult rule", async () => {
    const { ana, ben } = twoTabs();
    const thisYear = new Date().getFullYear();
    await ana.saveProfile({ ...adult, speaks: "he", learning: ["fr"] });
    await ben.saveProfile({ ...adult, name: "Ben", speaks: "fr", learning: ["he"] });
    const found = await ana.buddies();
    expect(found).toMatchObject({ ok: true, buddies: [{ name: "Ben", mutual: true }] });

    expect(await ana.sendDirect("device-ben", "salut Ben")).toEqual({ ok: true });
    expect((await ben.directMessages((await ana.me())!.id)).map((m) => m.body)).toEqual(["salut Ben"]);
    expect((await ben.conversations())[0].last.body).toBe("salut Ben");

    // Ben is 15 now: no longer matched with Ana, and needs to follow her to write.
    await ben.saveProfile({ ...adult, name: "Ben", speaks: "fr", learning: ["he"], birthYear: thisYear - 15 });
    expect(await ana.buddies()).toEqual({ ok: true, buddies: [] });
    const anaId = (await ana.me())!.id;
    expect(await ben.sendDirect(anaId, "hi")).toEqual({ ok: false, error: "follow_needed" });
    expect(await ana.sendDirect("device-ben", "hi")).toEqual({ ok: false, error: "not_allowed" });
    await ben.setFollowing(anaId, true);
    expect(await ben.sendDirect(anaId, "hi")).toEqual({ ok: true });

    const [, reply] = await ana.directMessages("device-ben");
    expect(await ben.reportDirect(reply.id)).toEqual({ ok: false, error: "not_allowed" });
    expect(await ana.reportDirect(reply.id)).toEqual({ ok: true });
    expect((await ana.queue())?.map((i) => i.kind)).toEqual(["direct"]);
    expect(await ana.directMessages("device-ben")).toHaveLength(1);
  });
});
