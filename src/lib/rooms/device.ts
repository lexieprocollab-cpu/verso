import { isUiLanguage } from "../i18n";
import type { Song } from "../song";
import { directMessageRule, rankBuddies } from "./buddies";
import { checkMessage, isAdult, isOldEnough, songVocabulary, type Vote } from "./rules";
import {
  groupConversations,
  utcDay,
  type DirectMessage,
  type OwnProfile,
  type QueueItem,
  type ReportKind,
  type RoomMessage,
  type RoomProfile,
  type RoomsBackend,
} from "./backend";

// Device demo of Song Rooms: everything lives in this browser's storage and
// updates live across tabs. Each tab can be a different learner (identity is
// kept per tab in sessionStorage), which makes the rooms easy to try alone.
// The same message rules run here as on the server.

type Report = { kind?: ReportKind; messageId: string; reporter: string; reason: string | null; at: number; resolved: boolean };
type Pair = [string, string];

type World = {
  profiles: Record<string, OwnProfile>;
  messages: (RoomMessage & { hidden?: boolean })[];
  votes: Vote[];
  reports: Report[];
  members: Record<string, string[]>;
  follows: Pair[];
  blocks: Pair[];
  bans: Record<string, number>;
  directs: (DirectMessage & { hidden?: boolean })[];
};

const EMPTY: World = { profiles: {}, messages: [], votes: [], reports: [], members: {}, follows: [], blocks: [], bans: {}, directs: [] };
const KEY = "verso.rooms.world";
const ME_KEY = "verso.rooms.me";
const MAX_MESSAGES = 1000;

export type DeviceEnv = {
  /** Opens a channel to this device's other tabs (BroadcastChannel in the browser). */
  openChannel?: (name: string) => {
    postMessage(data: unknown): void;
    addEventListener(type: "message", fn: (event: MessageEvent) => void): void;
    close(): void;
  };
  storage: Pick<Storage, "getItem" | "setItem">;
  /** Per-tab storage for "who am I" (falls back to `storage`). */
  session?: Pick<Storage, "getItem" | "setItem">;
  channel?: { postMessage(data: unknown): void; addEventListener(type: "message", fn: () => void): void; removeEventListener(type: "message", fn: () => void): void };
  now?: () => number;
  newId?: () => string;
};

function readWorld(storage: DeviceEnv["storage"]): World {
  try {
    const raw = storage.getItem(KEY);
    const value = raw ? (JSON.parse(raw) as Partial<World>) : {};
    return { ...EMPTY, ...value };
  } catch {
    return { ...EMPTY };
  }
}

export function createDeviceRooms(env: DeviceEnv): RoomsBackend {
  const now = env.now ?? Date.now;
  const newId = env.newId ?? (() => `${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const local = new Set<() => void>();

  function myId(): string {
    const existing = env.session?.getItem(ME_KEY) ?? env.storage.getItem(ME_KEY);
    const id = existing ?? `device-${newId()}`;
    env.session?.setItem(ME_KEY, id);
    if (!env.storage.getItem(ME_KEY)) env.storage.setItem(ME_KEY, id);
    return id;
  }

  function change(update: (world: World) => void) {
    const world = readWorld(env.storage);
    update(world);
    world.messages = world.messages.slice(-MAX_MESSAGES);
    world.directs = world.directs.slice(-MAX_MESSAGES);
    env.storage.setItem(KEY, JSON.stringify(world));
    local.forEach((notify) => notify());
    env.channel?.postMessage("changed");
  }

  const card = ({ id, name, avatar, speaks, learning, favorites }: OwnProfile): RoomProfile => ({ id, name, avatar, speaks, learning, favorites });
  const blockedBy = (world: World, me: string) => world.blocks.filter(([blocker]) => blocker === me).map(([, blocked]) => blocked);

  function memberProblem(world: World, me: string) {
    const profile = world.profiles[me];
    if (!profile?.name || !profile.birthYear || !profile.birthMonth) return "profile_needed" as const;
    if (!isOldEnough(profile.birthYear, profile.birthMonth, new Date(now()))) return "too_young" as const;
    if ((world.bans[me] ?? 0) > now()) return "banned" as const;
    return null;
  }

  const adult = (profile: OwnProfile) => isAdult(profile.birthYear ?? 0, profile.birthMonth ?? 12, new Date(now()));
  const eitherBlocked = (world: World, a: string, b: string) => world.blocks.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  function listen(onChange: () => void) {
    local.add(onChange);
    env.channel?.addEventListener("message", onChange);
    const onStorage = (event: StorageEvent) => event.key === KEY && onChange();
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
      local.delete(onChange);
      env.channel?.removeEventListener("message", onChange);
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
  }

  return {
    kind: "device",
    async me() {
      return readWorld(env.storage).profiles[myId()] ?? null;
    },
    async saveProfile(profile) {
      const id = myId();
      change((world) => {
        world.profiles[id] = {
          ...profile,
          id,
          name: profile.name.trim().slice(0, 60),
          learning: profile.learning.filter(isUiLanguage),
          favorites: profile.favorites.slice(0, 3),
        };
      });
      return { ok: true };
    },
    async messages(songId) {
      const world = readWorld(env.storage);
      const hiddenUsers = blockedBy(world, myId());
      return world.messages.filter((m) => m.songId === songId && !m.hidden && !hiddenUsers.includes(m.userId)).map(({ hidden, ...m }) => (void hidden, m));
    },
    async votes(songId) {
      const world = readWorld(env.storage);
      const ids = new Set(world.messages.filter((m) => m.songId === songId).map((m) => m.id));
      return world.votes.filter((v) => ids.has(v.messageId));
    },
    subscribe(_songId, onChange) {
      return listen(onChange);
    },
    async send(song: Song, body, mode, challenge) {
      const me = myId();
      const world = readWorld(env.storage);
      const problem = memberProblem(world, me) ?? checkMessage(body, mode, songVocabulary(song));
      if (problem) return { ok: false, error: problem };
      change((w) => {
        w.messages.push({ id: newId(), songId: song.id, userId: me, body: body.trim(), mode, challengeDay: challenge ? utcDay(0, now()) : null, createdAt: now() });
        const members = (w.members[song.id] ??= []);
        if (!members.includes(me)) members.push(me);
      });
      return { ok: true };
    },
    async report(messageId) {
      const me = myId();
      const message = readWorld(env.storage).messages.find((m) => m.id === messageId);
      if (!message || message.userId === me) return { ok: false, error: "not_allowed" };
      change((world) => {
        if (!world.reports.some((r) => r.messageId === messageId && r.reporter === me)) {
          world.reports.push({ messageId, reporter: me, reason: null, at: now(), resolved: false });
        }
        const target = world.messages.find((m) => m.id === messageId);
        if (target) target.hidden = true;
      });
      return { ok: true };
    },
    async vote(messageId) {
      const me = myId();
      const world = readWorld(env.storage);
      const problem = memberProblem(world, me);
      if (problem) return { ok: false, error: problem };
      const message = world.messages.find((m) => m.id === messageId);
      if (!message || message.hidden || message.userId === me || message.challengeDay !== utcDay(0, now())) return { ok: false, error: "not_allowed" };
      change((w) => {
        if (!w.votes.some((v) => v.messageId === messageId && v.voterId === me)) w.votes.push({ messageId, voterId: me });
      });
      return { ok: true };
    },
    async profiles(ids) {
      const world = readWorld(env.storage);
      return Object.fromEntries(ids.filter((id) => world.profiles[id]).map((id) => [id, card(world.profiles[id])]));
    },
    async memberCounts() {
      const world = readWorld(env.storage);
      return Object.fromEntries(Object.entries(world.members).map(([songId, ids]) => [songId, ids.length]));
    },
    async blocked() {
      return blockedBy(readWorld(env.storage), myId());
    },
    async setBlocked(userId, blocked) {
      const me = myId();
      if (userId === me) return;
      change((world) => {
        world.blocks = world.blocks.filter(([a, b]) => !(a === me && b === userId));
        if (blocked) world.blocks.push([me, userId]);
      });
    },
    async following() {
      const me = myId();
      return readWorld(env.storage).follows.filter(([a]) => a === me).map(([, b]) => b);
    },
    async setFollowing(userId, follow) {
      const me = myId();
      if (userId === me) return;
      change((world) => {
        world.follows = world.follows.filter(([a, b]) => !(a === me && b === userId));
        if (follow) world.follows.push([me, userId]);
      });
    },
    // On a device, whoever holds it is the moderator of the demo.
    async queue() {
      const world = readWorld(env.storage);
      const items: QueueItem[] = [];
      for (const report of world.reports.filter((r) => !r.resolved)) {
        const kind = report.kind ?? "room";
        if (items.some((i) => i.kind === kind && i.messageId === report.messageId)) continue;
        if (kind === "room") {
          const message = world.messages.find((m) => m.id === report.messageId);
          if (message) items.push({ kind, messageId: message.id, body: message.body, authorId: message.userId, reason: report.reason, reportedAt: report.at });
        } else {
          const message = world.directs.find((m) => m.id === report.messageId);
          if (message) items.push({ kind, messageId: message.id, body: message.body, authorId: message.from, reason: report.reason, reportedAt: report.at });
        }
      }
      return items;
    },
    async resolve(messageId, action, banDays, kind) {
      change((world) => {
        world.reports.forEach((r) => {
          if (r.messageId === messageId && (r.kind ?? "room") === kind) r.resolved = true;
        });
        const list: { id: string; hidden?: boolean }[] = kind === "room" ? world.messages : world.directs;
        const message = list.find((m) => m.id === messageId);
        if (!message) return;
        if (action === "restore") {
          message.hidden = false;
          return;
        }
        const author = kind === "room" ? (message as RoomMessage).userId : (message as DirectMessage).from;
        if (kind === "room") {
          world.messages = world.messages.filter((m) => m.id !== messageId);
          world.votes = world.votes.filter((v) => v.messageId !== messageId);
        } else world.directs = world.directs.filter((m) => m.id !== messageId);
        if (banDays > 0) world.bans[author] = now() + banDays * 86_400_000;
      });
      return { ok: true };
    },
    async buddies() {
      const me = myId();
      const world = readWorld(env.storage);
      const problem = memberProblem(world, me);
      if (problem) return { ok: false, error: problem };
      const others = Object.values(world.profiles).filter(
        (p) => p.name && p.birthYear && p.birthMonth && isOldEnough(p.birthYear, p.birthMonth, new Date(now())) && !eitherBlocked(world, me, p.id),
      );
      const ranked = rankBuddies(
        { ...world.profiles[me], adult: adult(world.profiles[me]) },
        others.map((p) => ({ ...p, adult: adult(p) })),
      );
      return { ok: true, buddies: ranked.map(({ profile, match }) => ({ ...card(profile), mutual: match.mutual })) };
    },
    async conversations() {
      const me = myId();
      const world = readWorld(env.storage);
      const visible = world.directs.filter((m) => !m.hidden && (m.from === me || m.to === me) && !blockedBy(world, me).includes(m.from === me ? m.to : m.from));
      return groupConversations(visible.map(({ hidden, ...m }) => (void hidden, m)), me);
    },
    async directMessages(other) {
      const me = myId();
      const world = readWorld(env.storage);
      if (blockedBy(world, me).includes(other)) return [];
      return world.directs
        .filter((m) => !m.hidden && ((m.from === me && m.to === other) || (m.from === other && m.to === me)))
        .map(({ hidden, ...m }) => (void hidden, m));
    },
    subscribeDirect(onChange) {
      return listen(onChange);
    },
    async sendDirect(to, body) {
      const me = myId();
      const world = readWorld(env.storage);
      const problem = memberProblem(world, me);
      if (problem) return { ok: false, error: problem };
      const sender = world.profiles[me];
      const recipient = world.profiles[to];
      if (to === me || !recipient?.birthYear || !recipient.birthMonth || !isOldEnough(recipient.birthYear, recipient.birthMonth, new Date(now()))) {
        return { ok: false, error: "not_allowed" };
      }
      const senderAdult = adult(sender);
      const recipientAdult = adult(recipient);
      const [minor, grownUp] = senderAdult ? [to, me] : [me, to];
      const rule = directMessageRule({
        senderAdult,
        recipientAdult,
        minorFollowsAdult: world.follows.some(([a, b]) => a === minor && b === grownUp),
        blockedEitherWay: eitherBlocked(world, me, to),
      });
      if (rule !== "ok") return { ok: false, error: rule };
      const messageProblem = checkMessage(body, "free", new Set());
      if (messageProblem) return { ok: false, error: messageProblem };
      change((w) => {
        w.directs.push({ id: newId(), from: me, to, body: body.trim(), createdAt: now() });
      });
      return { ok: true };
    },
    async reportDirect(messageId) {
      const me = myId();
      const message = readWorld(env.storage).directs.find((m) => m.id === messageId);
      if (!message || message.to !== me) return { ok: false, error: "not_allowed" };
      change((world) => {
        if (!world.reports.some((r) => r.kind === "direct" && r.messageId === messageId && r.reporter === me)) {
          world.reports.push({ kind: "direct", messageId, reporter: me, reason: null, at: now(), resolved: false });
        }
        const target = world.directs.find((m) => m.id === messageId);
        if (target) target.hidden = true;
      });
      return { ok: true };
    },
    partyChannel(songId) {
      const channel = env.openChannel?.(`verso.party.${songId}`);
      const listeners: ((message: unknown) => void)[] = [];
      channel?.addEventListener("message", (event) => listeners.forEach((listener) => listener(event.data)));
      return {
        send: (message) => channel?.postMessage(message),
        onMessage: (listener) => listeners.push(listener),
        close: () => channel?.close(),
      };
    },
  };
}
