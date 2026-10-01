import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUiLanguage } from "../i18n";
import { directMessageRule, rankBuddies } from "../rooms/buddies";
import { checkMessage, isAdult, isOldEnough, songVocabulary, type MessageProblem, type RoomMode } from "../rooms/rules";

// Server side of Song Rooms: every write goes through here and is checked.

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
  | MessageProblem;
export type RoomResult<T = null> = { ok: true; data: T } | { ok: false; error: RoomError };

const fail = (error: RoomError): { ok: false; error: RoomError } => ({ ok: false, error });

/** Today as YYYY-MM-DD in UTC: the daily challenge changes at midnight UTC for everyone. */
export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// Burst limit: at most 8 messages per 30 seconds per learner (per server instance).
const recent = new Map<string, number[]>();
export function allowMessage(userId: string, now = Date.now()): boolean {
  const times = (recent.get(userId) ?? []).filter((t) => now - t < 30_000);
  if (times.length >= 8) return false;
  recent.set(userId, [...times, now]);
  return true;
}

async function checkMember(db: SupabaseClient, userId: string): Promise<RoomError | null> {
  const [{ data: profile }, { data: ban }] = await Promise.all([
    db.from("profiles").select("display_name, birth_year, birth_month").eq("id", userId).maybeSingle(),
    db.from("bans").select("until").eq("user_id", userId).maybeSingle(),
  ]);
  if (!profile?.display_name || !profile.birth_year || !profile.birth_month) return "profile_needed";
  if (!isOldEnough(profile.birth_year, profile.birth_month, new Date())) return "too_young";
  if (ban && new Date(ban.until) > new Date()) return "banned";
  return null;
}

export async function sendMessage(
  db: SupabaseClient,
  userId: string,
  input: { songId: string; body: string; mode: RoomMode; challenge: boolean },
): Promise<RoomResult<{ id: number }>> {
  const memberProblem = await checkMember(db, userId);
  if (memberProblem) return fail(memberProblem);

  const { data: lines } = await db.from("lyric_lines").select("text").eq("song_id", input.songId);
  if (!lines?.length) return fail("no_room");
  const problem = checkMessage(input.body, input.mode, songVocabulary({ lines: lines.map((l) => ({ ...l, start: 0, end: 0, translations: {} })) }));
  if (problem) return fail(problem);
  if (!allowMessage(userId)) return fail("slow_down");

  await db.from("room_members").upsert({ song_id: input.songId, user_id: userId }, { onConflict: "song_id,user_id", ignoreDuplicates: true });
  const { data, error } = await db
    .from("messages")
    .insert({
      song_id: input.songId,
      user_id: userId,
      body: input.body.trim(),
      mode: input.mode,
      challenge_day: input.challenge ? utcDay() : null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return { ok: true, data: { id: data.id } };
}

/** Reporting hides the message at once; a moderator restores or removes it. */
export async function reportMessage(db: SupabaseClient, userId: string, messageId: number, reason?: string): Promise<RoomResult> {
  const { data: message } = await db.from("messages").select("id, user_id").eq("id", messageId).maybeSingle();
  if (!message || message.user_id === userId) return fail("not_allowed");
  await db.from("reports").upsert(
    { message_id: messageId, reporter: userId, reason: reason?.slice(0, 200) ?? null },
    { onConflict: "message_id,reporter", ignoreDuplicates: true },
  );
  await db.from("messages").update({ hidden: true }).eq("id", messageId);
  return { ok: true, data: null };
}

/** Votes count only for today's challenge entries, one per learner, never your own. */
export async function voteForEntry(db: SupabaseClient, userId: string, messageId: number): Promise<RoomResult> {
  const memberProblem = await checkMember(db, userId);
  if (memberProblem) return fail(memberProblem);
  const { data: message } = await db.from("messages").select("user_id, challenge_day, hidden").eq("id", messageId).maybeSingle();
  if (!message || message.hidden || message.user_id === userId || message.challenge_day !== utcDay()) return fail("not_allowed");
  await db.from("message_votes").upsert({ message_id: messageId, voter: userId }, { onConflict: "message_id,voter", ignoreDuplicates: true });
  return { ok: true, data: null };
}

export async function isModerator(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db.from("moderators").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

export type ReportKind = "room" | "direct";
export type QueueItem = { kind: ReportKind; messageId: number; body: string; authorId: string; reason: string | null; reportedAt: string };

type ReportRow = {
  id: number;
  message_id: number | null;
  direct_message_id: number | null;
  reason: string | null;
  created_at: string;
  messages: { body: string; user_id: string } | { body: string; user_id: string }[] | null;
  direct_messages: { body: string; sender: string } | { body: string; sender: string }[] | null;
};
const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

export async function moderationQueue(db: SupabaseClient): Promise<QueueItem[]> {
  const { data } = await db
    .from("reports")
    .select("id, message_id, direct_message_id, reason, created_at, messages(body, user_id), direct_messages(body, sender)")
    .is("resolved_at", null)
    .order("created_at", { ascending: true })
    .limit(100);
  return ((data ?? []) as ReportRow[]).map((row) => {
    const room = one(row.messages);
    const direct = one(row.direct_messages);
    return {
      kind: row.direct_message_id ? "direct" : "room",
      messageId: (row.direct_message_id ?? row.message_id)!,
      body: room?.body ?? direct?.body ?? "",
      authorId: room?.user_id ?? direct?.sender ?? "",
      reason: row.reason,
      reportedAt: row.created_at,
    };
  });
}

/** Restore a message, or remove it and ban its author for `banDays` (0 = no ban). */
export async function resolveReport(
  db: SupabaseClient,
  messageId: number,
  action: "restore" | "remove",
  banDays: number,
  kind: ReportKind = "room",
): Promise<void> {
  const table = kind === "room" ? "messages" : "direct_messages";
  const author = kind === "room" ? "user_id" : "sender";
  const now = new Date();
  await db
    .from("reports")
    .update({ resolved_at: now.toISOString(), resolution: action === "restore" ? "restored" : "removed" })
    .eq(kind === "room" ? "message_id" : "direct_message_id", messageId)
    .is("resolved_at", null);
  if (action === "restore") {
    await db.from(table).update({ hidden: false }).eq("id", messageId);
    return;
  }
  const { data: message } = await db.from(table).select(author).eq("id", messageId).maybeSingle();
  await db.from(table).delete().eq("id", messageId);
  const authorId = (message as Record<string, string> | null)?.[author];
  if (authorId && banDays > 0) {
    const until = new Date(now.getTime() + banDays * 24 * 60 * 60 * 1000).toISOString();
    await db.from("bans").upsert({ user_id: authorId, until, reason: "reported message removed" }, { onConflict: "user_id" });
  }
}

// ---------------------------------------------------------------------------
// Language buddies and private messages (step 26)

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar: string | null;
  speak_language: string | null;
  learning: string[] | null;
  favorite_songs: string[] | null;
  birth_year: number | null;
  birth_month: number | null;
};

export type BuddyCard = {
  id: string;
  name: string;
  avatar: string;
  speaks: string | null;
  learning: string[];
  favorites: string[];
  mutual: boolean;
};

const adultNow = (row: Pick<ProfileRow, "birth_year" | "birth_month">) => isAdult(row.birth_year ?? 0, row.birth_month ?? 12, new Date());

function buddyShape(row: ProfileRow) {
  return {
    id: row.id,
    speaks: isUiLanguage(row.speak_language) ? row.speak_language : null,
    learning: (row.learning ?? []).filter(isUiLanguage),
    favorites: row.favorite_songs ?? [],
    adult: adultNow(row),
  };
}

/** Best language-buddy matches for a learner, within their age group, minus blocks. */
export async function findBuddies(db: SupabaseClient, userId: string): Promise<RoomResult<BuddyCard[]>> {
  const memberProblem = await checkMember(db, userId);
  if (memberProblem) return fail(memberProblem);
  const [{ data: rows }, { data: blocks }] = await Promise.all([
    db.from("profiles").select("id, display_name, avatar, speak_language, learning, favorite_songs, birth_year, birth_month").limit(2000),
    db.from("blocks").select("blocker, blocked"),
  ]);
  const profiles = ((rows ?? []) as ProfileRow[]).filter((row) => row.display_name && row.birth_year && row.birth_month);
  const me = profiles.find((row) => row.id === userId);
  if (!me) return fail("profile_needed");
  const blocked = new Set(
    ((blocks ?? []) as { blocker: string; blocked: string }[])
      .filter((b) => b.blocker === userId || b.blocked === userId)
      .map((b) => (b.blocker === userId ? b.blocked : b.blocker)),
  );
  const candidates = profiles.filter((row) => !blocked.has(row.id) && isOldEnough(row.birth_year!, row.birth_month!, new Date()));
  const byId = new Map(candidates.map((row) => [row.id, row]));
  const ranked = rankBuddies(buddyShape(me), candidates.map(buddyShape));
  return {
    ok: true,
    data: ranked.map(({ profile, match }) => {
      const row = byId.get(profile.id)!;
      return {
        id: row.id,
        name: row.display_name!,
        avatar: row.avatar ?? "🎧",
        speaks: profile.speaks,
        learning: profile.learning,
        favorites: profile.favorites,
        mutual: match.mutual,
      };
    }),
  };
}

export async function sendDirect(db: SupabaseClient, userId: string, input: { to: string; body: string }): Promise<RoomResult<{ id: number }>> {
  const memberProblem = await checkMember(db, userId);
  if (memberProblem) return fail(memberProblem);
  if (input.to === userId) return fail("not_allowed");
  const [{ data: sender }, { data: recipient }, { data: blocks }] = await Promise.all([
    db.from("profiles").select("birth_year, birth_month").eq("id", userId).maybeSingle(),
    db.from("profiles").select("display_name, birth_year, birth_month").eq("id", input.to).maybeSingle(),
    db.from("blocks").select("blocker, blocked"),
  ]);
  if (!sender || !recipient?.display_name || !recipient.birth_year || !recipient.birth_month) return fail("not_allowed");
  if (!isOldEnough(recipient.birth_year, recipient.birth_month, new Date())) return fail("not_allowed");

  const senderAdult = adultNow(sender);
  const recipientAdult = adultNow(recipient);
  let minorFollowsAdult = false;
  if (senderAdult !== recipientAdult) {
    const [minor, adult] = senderAdult ? [input.to, userId] : [userId, input.to];
    const { data: follow } = await db.from("follows").select("follower").eq("follower", minor).eq("followee", adult).maybeSingle();
    minorFollowsAdult = Boolean(follow);
  }
  const blockedEitherWay = ((blocks ?? []) as { blocker: string; blocked: string }[]).some(
    (b) => (b.blocker === userId && b.blocked === input.to) || (b.blocker === input.to && b.blocked === userId),
  );
  const rule = directMessageRule({ senderAdult, recipientAdult, minorFollowsAdult, blockedEitherWay });
  if (rule !== "ok") return fail(rule);

  const problem = checkMessage(input.body, "free", new Set());
  if (problem) return fail(problem);
  if (!allowMessage(userId)) return fail("slow_down");

  const { data, error } = await db
    .from("direct_messages")
    .insert({ sender: userId, recipient: input.to, body: input.body.trim() })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return { ok: true, data: { id: data.id } };
}

/** Only the person who received a private message can report it; it's hidden at once. */
export async function reportDirect(db: SupabaseClient, userId: string, messageId: number, reason?: string): Promise<RoomResult> {
  const { data: message } = await db.from("direct_messages").select("id, recipient").eq("id", messageId).maybeSingle();
  if (!message || message.recipient !== userId) return fail("not_allowed");
  await db.from("reports").upsert(
    { direct_message_id: messageId, reporter: userId, reason: reason?.slice(0, 200) ?? null },
    { onConflict: "direct_message_id,reporter", ignoreDuplicates: true },
  );
  await db.from("direct_messages").update({ hidden: true }).eq("id", messageId);
  return { ok: true, data: null };
}
