// Listening parties: everyone in a room hears the song in sync.
//
// The host broadcasts where the song is ("state") every couple of seconds and
// on every play, pause or seek. Guests anchor that position to their own clock
// when it arrives, so phones never have to agree on the time of day; network
// delay (~0.1 s) is well inside the resync tolerance.

export const REACTIONS = ["❤️", "😂", "🔥", "👏", "😮", "🎵"] as const;
export type Reaction = (typeof REACTIONS)[number];

export type PartyMessage =
  | { type: "state"; from: string; name: string; position: number; playing: boolean }
  | { type: "hello"; from: string; name: string }
  | { type: "ping"; from: string; name: string }
  | { type: "react"; from: string; name: string; emoji: Reaction }
  | { type: "end"; from: string };

/** How often the host repeats the state and guests say they're still here. */
export const HEARTBEAT_MS = 2000;
/** A guest counts as gone after this long without a message. */
export const MEMBER_TIMEOUT_MS = 8000;
/** The party ends for guests if the host goes quiet this long. */
export const HOST_TIMEOUT_MS = 8000;
/** Guests jump to the host's position when they drift further than this (seconds). */
export const RESYNC_TOLERANCE = 0.6;

const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

/** Messages come from other people's browsers: accept only well-formed ones. */
export function parsePartyMessage(value: unknown): PartyMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  if (!isText(m.from, 80)) return null;
  const name = typeof m.name === "string" ? m.name.slice(0, 60) : "";
  switch (m.type) {
    case "state":
      if (typeof m.position !== "number" || !Number.isFinite(m.position) || m.position < 0 || m.position > 24 * 3600) return null;
      if (typeof m.playing !== "boolean") return null;
      return { type: "state", from: m.from, name, position: m.position, playing: m.playing };
    case "hello":
    case "ping":
      return { type: m.type, from: m.from, name };
    case "react":
      return (REACTIONS as readonly unknown[]).includes(m.emoji) ? { type: "react", from: m.from, name, emoji: m.emoji as Reaction } : null;
    case "end":
      return { type: "end", from: m.from };
    default:
      return null;
  }
}

export type Anchor = { position: number; playing: boolean; receivedAt: number };

/** Where the host's song is now, from the last state received. */
export function positionNow(anchor: Anchor, now: number, duration: number): number {
  const position = anchor.playing ? anchor.position + (now - anchor.receivedAt) / 1000 : anchor.position;
  return Math.min(Math.max(0, position), duration);
}

export function needsResync(local: number, target: number): boolean {
  return Math.abs(local - target) > RESYNC_TOLERANCE;
}

export type Member = { name: string; seenAt: number };

/** People heard from recently, host included. */
export function activeMembers(members: Record<string, Member>, now: number): string[] {
  return Object.keys(members).filter((id) => now - members[id].seenAt <= MEMBER_TIMEOUT_MS);
}
