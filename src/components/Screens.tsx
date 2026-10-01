"use client";

import { useEffect, type ReactNode } from "react";
import { TRIAL_SONGS, songAccess } from "@/lib/billing";
import { format } from "@/lib/i18n";
import { startTrialSong, trialSongsStore } from "@/lib/learnerStores";
import type { Song } from "@/lib/song";
import { recordTrialSongOnServer, useSubscription } from "@/lib/subscription";
import { track } from "@/lib/track";
import { Paywall } from "./Paywall";
import { Player } from "./Player";
import { usePreferences } from "./Preferences";
import { Quiz } from "./Quiz";
import { SongRoute } from "./SongRoute";

/**
 * Applies the free trial: free songs and subscribers pass; otherwise the first
 * TRIAL_SONGS songs opened are free and later ones show the paywall.
 */
function SongGate({ song, children }: { song: Song; children: ReactNode }) {
  const { t } = usePreferences();
  const trialSongs = trialSongsStore.useValue();
  const subscription = useSubscription();
  const access = songAccess(song.id, { free: Boolean(song.free), subscribed: subscription === "active", trialSongs });
  const startsTrial = access.allowed && access.trialNumber !== null && !trialSongs.includes(song.id);

  useEffect(() => {
    if (!startsTrial) return;
    if (startTrialSong(song.id)) void recordTrialSongOnServer(song.id);
  }, [startsTrial, song.id]);

  useEffect(() => {
    if (access.allowed) track("song_opened", { song: song.id });
  }, [access.allowed, song.id]);

  if (subscription === "loading" && !song.free) return null;
  if (!access.allowed) return <Paywall songId={song.id} />;
  return (
    <>
      {access.trialNumber !== null && (
        <p className="mt-2 rounded-full bg-amber-300/30 px-3 py-1 text-center text-sm font-medium">
          🎁 {format(t.paywall.freeSong, { n: access.trialNumber, total: TRIAL_SONGS })}
        </p>
      )}
      {children}
    </>
  );
}

export function PlayerScreen({ songId, startLine }: { songId?: string; startLine: number | null }) {
  return (
    <SongRoute songId={songId}>
      {(song) => (
        <SongGate song={song}>
          <Player key={song.id} song={song} startLine={startLine} />
        </SongGate>
      )}
    </SongRoute>
  );
}

export function QuizScreen({ songId }: { songId?: string }) {
  return (
    <SongRoute songId={songId}>
      {(song) => (
        <SongGate song={song}>
          <Quiz key={song.id} song={song} />
        </SongGate>
      )}
    </SongRoute>
  );
}
