import type { UiLanguage } from "../i18n";
import type { Song } from "../song";
import type { RoomMode, Vote } from "./rules";

// What the Song Rooms screens need from a backend. Two implementations:
// the cloud one (Supabase + /api/rooms) and a device demo that runs until the
// database is connected (localStorage, live across tabs).

export type RoomProfile = {
  id: string;
  name: string;
  avatar: string;
  speaks: UiLanguage | null;
  learning: UiLanguage[];
  favorites: string[];
};

/** Your own profile adds the birth month and year used for the age gate. */
export type OwnProfile = RoomProfile & { birthYear: number | null; birthMonth: number | null };

export type RoomMessage = {
  id: string;
  songId: string;
  userId: string;
  body: string;
  mode: RoomMode;
  /** YYYY-MM-DD (UTC) for daily-challenge entries, else null. */
  challengeDay: string | null;
  createdAt: number;
};

export type ReportKind = "room" | "direct";
export type QueueItem = { kind: ReportKind; messageId: string; body: string; authorId: string; reason: string | null; reportedAt: number };

export type Buddy = RoomProfile & { mutual: boolean };
export type DirectMessage = { id: string; from: string; to: string; body: string; createdAt: number };
export type Conversation = { other: string; last: DirectMessage };

export type RoomError =
  | "sign_in_required"
  | "profile_needed"
  | "too_young"
  | "banned"
  | "no_room"
  | "slow_down"
  | "not_allowed"
  | "follow_needed"
  | "blocked"
  | "empty"
  | "too_long"
  | "outside_words"
  | "blocked_word"
  | "failed";

export type RoomResult = { ok: true } | { ok: false; error: RoomError };

export type RoomsBackend = {
  kind: "cloud" | "device";
  /** Your profile; null when signed out (cloud only). */
  me(): Promise<OwnProfile | null>;
  saveProfile(profile: Omit<OwnProfile, "id">): Promise<RoomResult>;
  messages(songId: string): Promise<RoomMessage[]>;
  votes(songId: string): Promise<Vote[]>;
  /** Calls `onChange` whenever the room's messages or votes change. */
  subscribe(songId: string, onChange: () => void): () => void;
  send(song: Song, body: string, mode: RoomMode, challenge: boolean): Promise<RoomResult>;
  report(messageId: string): Promise<RoomResult>;
  vote(messageId: string): Promise<RoomResult>;
  profiles(ids: string[]): Promise<Record<string, RoomProfile>>;
  memberCounts(): Promise<Record<string, number>>;
  blocked(): Promise<string[]>;
  setBlocked(userId: string, blocked: boolean): Promise<void>;
  following(): Promise<string[]>;
  setFollowing(userId: string, follow: boolean): Promise<void>;
  /** Unresolved reports, or null if you're not a moderator. */
  queue(): Promise<QueueItem[] | null>;
  resolve(messageId: string, action: "restore" | "remove", banDays: number, kind: ReportKind): Promise<RoomResult>;
  /** Language-buddy matches, best first (same age group only). */
  buddies(): Promise<{ ok: true; buddies: Buddy[] } | { ok: false; error: RoomError }>;
  conversations(): Promise<Conversation[]>;
  directMessages(otherId: string): Promise<DirectMessage[]>;
  /** Calls `onChange` when a private message to or from you arrives or changes. */
  subscribeDirect(onChange: () => void): () => void;
  sendDirect(to: string, body: string): Promise<RoomResult>;
  reportDirect(messageId: string): Promise<RoomResult>;
  /** Live channel for a room's listening party (messages are untrusted: parse them). */
  partyChannel(songId: string): PartyChannel;
};

export type PartyChannel = {
  send(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  close(): void;
};

export const AVATARS = ["🎧", "🎸", "🎤", "🎹", "🥁", "🎻", "🎷", "🌊", "🌙", "🌻", "🦊", "🐙"];

/** Today (or `offsetDays` from today) as YYYY-MM-DD in UTC. */
export function utcDay(offsetDays = 0, now = Date.now()): string {
  return new Date(now + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** Latest message per conversation partner, newest conversations first. */
export function groupConversations(messages: DirectMessage[], me: string): Conversation[] {
  const latest = new Map<string, DirectMessage>();
  for (const message of messages) {
    const other = message.from === me ? message.to : message.from;
    const current = latest.get(other);
    if (!current || message.createdAt > current.createdAt) latest.set(other, message);
  }
  return [...latest.entries()].map(([other, last]) => ({ other, last })).sort((a, b) => b.last.createdAt - a.last.createdAt);
}
