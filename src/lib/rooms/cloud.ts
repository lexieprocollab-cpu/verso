import type { SupabaseClient } from "@supabase/supabase-js";
import { isUiLanguage } from "../i18n";
import { groupConversations, type DirectMessage, type RoomError, type RoomProfile, type RoomResult, type RoomsBackend, type RoomMessage } from "./backend";

// Cloud Song Rooms: reads go straight to Supabase under row-level security
// (hidden messages and people you blocked never arrive), live updates come
// from Supabase Realtime, and every message, report and vote goes through
// /api/rooms so the server can check it.

type MessageRow = { id: number; song_id: string; user_id: string; body: string; mode: "free" | "song"; challenge_day: string | null; created_at: string };
type CardRow = { id: string; display_name: string | null; avatar: string | null; speak_language: string | null; learning: string[] | null; favorite_songs: string[] | null };

const toMessage = (row: MessageRow): RoomMessage => ({
  id: String(row.id),
  songId: row.song_id,
  userId: row.user_id,
  body: row.body,
  mode: row.mode,
  challengeDay: row.challenge_day,
  createdAt: Date.parse(row.created_at),
});

type DirectRow = { id: number; sender: string; recipient: string; body: string; created_at: string };
const toDirect = (row: DirectRow): DirectMessage => ({ id: String(row.id), from: row.sender, to: row.recipient, body: row.body, createdAt: Date.parse(row.created_at) });

const toCard = (row: CardRow): RoomProfile => ({
  id: row.id,
  name: row.display_name ?? "",
  avatar: row.avatar ?? "🎧",
  speaks: isUiLanguage(row.speak_language) ? row.speak_language : null,
  learning: (row.learning ?? []).filter(isUiLanguage),
  favorites: row.favorite_songs ?? [],
});

/** `apiBase` is the web app's address for callers outside it (the mobile app); empty on the web. */
export function createCloudRooms(db: SupabaseClient, apiBase = ""): RoomsBackend {
  async function session() {
    const { data } = await db.auth.getSession();
    return data.session;
  }

  async function userId(): Promise<string | null> {
    return (await session())?.user.id ?? null;
  }

  async function api(method: "GET" | "POST", action: string, body?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: RoomError }> {
    const token = (await session())?.access_token;
    if (!token) return { ok: false, error: "sign_in_required" };
    try {
      const response = await fetch(`${apiBase}/api/rooms/${action}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data: unknown = await response.json().catch(() => null);
      if (response.ok) return { ok: true, data };
      const error = (data as { error?: RoomError } | null)?.error;
      return { ok: false, error: error ?? "failed" };
    } catch {
      return { ok: false, error: "failed" };
    }
  }

  const result = (outcome: Awaited<ReturnType<typeof api>>): RoomResult => (outcome.ok ? { ok: true } : outcome);

  return {
    kind: "cloud",
    async me() {
      const id = await userId();
      if (!id) return null;
      const { data } = await db
        .from("profiles")
        .select("id, display_name, avatar, speak_language, learning, favorite_songs, birth_year, birth_month")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return { ...toCard(data as CardRow), birthYear: data.birth_year, birthMonth: data.birth_month };
    },
    async saveProfile(profile) {
      const id = await userId();
      if (!id) return { ok: false, error: "sign_in_required" };
      const { error } = await db
        .from("profiles")
        .update({
          display_name: profile.name.trim().slice(0, 60),
          avatar: profile.avatar,
          speak_language: profile.speaks,
          learning: profile.learning,
          favorite_songs: profile.favorites.slice(0, 3),
          birth_year: profile.birthYear,
          birth_month: profile.birthMonth,
        })
        .eq("id", id);
      return error ? { ok: false, error: "failed" } : { ok: true };
    },
    async messages(songId) {
      const { data } = await db
        .from("messages")
        .select("id, song_id, user_id, body, mode, challenge_day, created_at")
        .eq("song_id", songId)
        .order("created_at", { ascending: false })
        .limit(200);
      return ((data ?? []) as MessageRow[]).map(toMessage).reverse();
    },
    async votes(songId) {
      const { data } = await db.from("message_votes").select("message_id, voter, messages!inner(song_id)").eq("messages.song_id", songId);
      return ((data ?? []) as { message_id: number; voter: string }[]).map((row) => ({ messageId: String(row.message_id), voterId: row.voter }));
    },
    subscribe(songId, onChange) {
      const channel = db
        .channel(`room:${songId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `song_id=eq.${songId}` }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "message_votes" }, onChange)
        .subscribe();
      return () => {
        void db.removeChannel(channel);
      };
    },
    async send(song, body, mode, challenge) {
      return result(await api("POST", "send", { songId: song.id, body, mode, challenge }));
    },
    async report(messageId) {
      return result(await api("POST", "report", { messageId: Number(messageId) }));
    },
    async vote(messageId) {
      return result(await api("POST", "vote", { messageId: Number(messageId) }));
    },
    async profiles(ids) {
      if (!ids.length) return {};
      const { data } = await db.from("profile_cards").select("*").in("id", ids);
      return Object.fromEntries(((data ?? []) as CardRow[]).map((row) => [row.id, toCard(row)]));
    },
    async memberCounts() {
      const { data } = await db.from("room_members").select("song_id").limit(10_000);
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { song_id: string }[]) counts[row.song_id] = (counts[row.song_id] ?? 0) + 1;
      return counts;
    },
    async blocked() {
      const id = await userId();
      if (!id) return [];
      const { data } = await db.from("blocks").select("blocked").eq("blocker", id);
      return ((data ?? []) as { blocked: string }[]).map((row) => row.blocked);
    },
    async setBlocked(other, blocked) {
      const id = await userId();
      if (!id || id === other) return;
      if (blocked) await db.from("blocks").upsert({ blocker: id, blocked: other }, { onConflict: "blocker,blocked", ignoreDuplicates: true });
      else await db.from("blocks").delete().eq("blocker", id).eq("blocked", other);
    },
    async following() {
      const id = await userId();
      if (!id) return [];
      const { data } = await db.from("follows").select("followee").eq("follower", id);
      return ((data ?? []) as { followee: string }[]).map((row) => row.followee);
    },
    async setFollowing(other, follow) {
      const id = await userId();
      if (!id || id === other) return;
      if (follow) await db.from("follows").upsert({ follower: id, followee: other }, { onConflict: "follower,followee", ignoreDuplicates: true });
      else await db.from("follows").delete().eq("follower", id).eq("followee", other);
    },
    async queue() {
      const outcome = await api("GET", "queue");
      if (!outcome.ok) return null;
      type Item = { kind: "room" | "direct"; messageId: number; body: string; authorId: string; reason: string | null; reportedAt: string };
      const items = (outcome.data as { items: Item[] }).items;
      return items
        .filter((item, index) => items.findIndex((other) => other.kind === item.kind && other.messageId === item.messageId) === index)
        .map((item) => ({ ...item, messageId: String(item.messageId), reportedAt: Date.parse(item.reportedAt) }));
    },
    async resolve(messageId, action, banDays, kind) {
      return result(await api("POST", "resolve", { messageId: Number(messageId), action, banDays, kind }));
    },
    async buddies() {
      const outcome = await api("GET", "buddies");
      if (!outcome.ok) return outcome;
      type Item = { id: string; name: string; avatar: string; speaks: string | null; learning: string[]; favorites: string[]; mutual: boolean };
      const items = (outcome.data as { items: Item[] }).items;
      return {
        ok: true,
        buddies: items.map((item) => ({
          ...toCard({ id: item.id, display_name: item.name, avatar: item.avatar, speak_language: item.speaks, learning: item.learning, favorite_songs: item.favorites }),
          mutual: item.mutual,
        })),
      };
    },
    async conversations() {
      const id = await userId();
      if (!id) return [];
      const { data } = await db.from("direct_messages").select("id, sender, recipient, body, created_at").order("created_at", { ascending: false }).limit(300);
      return groupConversations(((data ?? []) as DirectRow[]).map(toDirect), id);
    },
    async directMessages(other) {
      const id = await userId();
      if (!id) return [];
      const { data } = await db
        .from("direct_messages")
        .select("id, sender, recipient, body, created_at")
        .or(`and(sender.eq.${id},recipient.eq.${other}),and(sender.eq.${other},recipient.eq.${id})`)
        .order("created_at", { ascending: false })
        .limit(200);
      return ((data ?? []) as DirectRow[]).map(toDirect).reverse();
    },
    subscribeDirect(onChange) {
      let stopped = false;
      let remove = () => {};
      void userId().then((id) => {
        if (!id || stopped) return;
        const channel = db
          .channel(`dm:${id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `recipient=eq.${id}` }, onChange)
          .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `sender=eq.${id}` }, onChange)
          .subscribe();
        remove = () => void db.removeChannel(channel);
      });
      return () => {
        stopped = true;
        remove();
      };
    },
    async sendDirect(to, body) {
      return result(await api("POST", "dm", { to, body }));
    },
    async reportDirect(messageId) {
      return result(await api("POST", "dm-report", { messageId: Number(messageId) }));
    },
    // Realtime broadcast: fast, not stored, and never echoed back to the sender.
    partyChannel(songId) {
      const listeners: ((message: unknown) => void)[] = [];
      const channel = db
        .channel(`party:${songId}`, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "party" }, ({ payload }) => listeners.forEach((listener) => listener(payload)))
        .subscribe();
      return {
        send: (message) => void channel.send({ type: "broadcast", event: "party", payload: message }),
        onMessage: (listener) => listeners.push(listener),
        close: () => void db.removeChannel(channel),
      };
    },
  };
}
