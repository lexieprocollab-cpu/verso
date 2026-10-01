"use client";

import { useState } from "react";
import type { QueueItem } from "@/lib/rooms/backend";
import { LANGUAGE_NAMES, isUiLanguage } from "@/lib/i18n";
import type { PendingSong } from "@/lib/artistClient";
import { useArtists } from "../artists/useArtists";
import { usePreferences } from "../Preferences";
import { useLive, useRoomsBackend } from "./useRooms";

/** Reported messages, hidden until a moderator restores or removes them. */
export function Moderation() {
  const { t } = usePreferences();
  const rooms = useRoomsBackend();
  const [queue, reload] = useLive(rooms ? () => rooms.queue() : null, null, [rooms]);

  async function resolve(item: QueueItem, action: "restore" | "remove", banDays: number) {
    await rooms?.resolve(item.messageId, action, banDays, item.kind);
    reload();
  }

  return (
    <section className="space-y-4 pt-4">
      <h1 className="text-3xl font-bold">{t.rooms.moderation}</h1>
      <SongReview />
      {rooms?.kind === "device" && <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">{t.rooms.deviceMode}</p>}
      {queue === undefined ? (
        <p className="text-muted">…</p>
      ) : queue === null ? (
        <p className="text-muted">{t.rooms.notModerator}</p>
      ) : queue.length === 0 ? (
        <p className="text-muted">{t.rooms.queueEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {queue.map((item) => (
            <li key={`${item.kind}:${item.messageId}`} className="space-y-2 rounded-2xl border border-border bg-surface p-4">
              {item.kind === "direct" && <p className="text-xs font-semibold text-muted uppercase">{t.buddies.privateMessage}</p>}
              <p className="text-lg">{item.body}</p>
              {item.reason && <p className="text-sm text-muted">{item.reason}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void resolve(item, "restore", 0)} className="rounded-xl border border-border px-3 py-1.5">
                  {t.rooms.restore}
                </button>
                <button type="button" onClick={() => void resolve(item, "remove", 0)} className="rounded-xl border border-border px-3 py-1.5">
                  {t.rooms.remove}
                </button>
                <button type="button" onClick={() => void resolve(item, "remove", 7)} className="rounded-xl border border-red-600 px-3 py-1.5 text-red-600">
                  {t.rooms.removeBan}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Artist submissions: approve to publish, or reject with a note for the artist. */
function SongReview() {
  const { t } = usePreferences();
  const artists = useArtists();
  const [pending, reload] = useLive(artists ? () => artists.pending() : null, null, [artists]);
  if (!pending?.length) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t.artists.review}</h2>
      <ul className="space-y-3">
        {pending.map((song) => (
          <PendingSongRow
            key={song.id}
            song={song}
            onReview={async (approve, note) => {
              await artists?.review(song.id, approve, note);
              reload();
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function PendingSongRow({ song, onReview }: { song: PendingSong; onReview: (approve: boolean, note: string) => void }) {
  const { t } = usePreferences();
  const [note, setNote] = useState("");
  return (
    <li className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <p className="font-semibold">
        {song.title} · {song.artist}
        {isUiLanguage(song.language) && <span className="ms-2 text-sm font-normal text-muted">{LANGUAGE_NAMES[song.language]}</span>}
      </p>
      <p className="max-h-32 overflow-y-auto text-sm whitespace-pre-line text-muted">{song.lines.join("\n")}</p>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t.artists.note} className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button type="button" onClick={() => onReview(true, note)} className="rounded-xl bg-accent px-3 py-1.5 font-semibold text-white">
          {t.artists.approve}
        </button>
        <button type="button" onClick={() => onReview(false, note)} className="rounded-xl border border-border px-3 py-1.5">
          {t.artists.reject}
        </button>
      </div>
    </li>
  );
}
