"use client";

import { useState } from "react";
import { isYouTubeId, type MediaSource } from "@/lib/media";
import type { Song } from "@/lib/song";

/**
 * The song's sound for usePlayback: its official YouTube video when it has one
 * (rendered by <SongVideo>), else its audio file, else nothing (timer).
 */
export function useSongSource(song: Song) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const videoId = song.youtubeId && isYouTubeId(song.youtubeId) ? song.youtubeId : null;
  const source: string | MediaSource | undefined = videoId ? (element ? { kind: "youtube", videoId, element } : undefined) : song.audioUrl;
  return { source, videoId, videoRef: setElement };
}

/** The visible YouTube player (YouTube's terms don't allow hiding it). */
export function SongVideo({ videoRef, title }: { videoRef: (element: HTMLDivElement | null) => void; title: string }) {
  return <div ref={videoRef} title={title} className="aspect-video w-full overflow-hidden rounded-2xl bg-black" data-testid="song-video" />;
}
