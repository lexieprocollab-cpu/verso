"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createMedia, type Media, type MediaSource } from "./media";

export type Loop = { start: number; end: number } | null;

/**
 * Playback clock for the player and the timing tool. With a source (an audio
 * URL, or a YouTube video) it plays that and follows its position; without
 * one (demo songs), a requestAnimationFrame timer stands in for the music.
 */
export function usePlayback(duration: number, initialTime = 0, source?: string | MediaSource) {
  const [time, setTime] = useState(initialTime);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<Loop>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);

  const timeRef = useRef(initialTime);
  const rateRef = useRef(rate);
  const loopRef = useRef(loop);
  const audioRef = useRef<Media | null>(null);
  const resolved: MediaSource | undefined = typeof source === "string" ? { kind: "audio", url: source } : source;
  const sourceKey = !resolved ? "" : resolved.kind === "audio" ? `audio:${resolved.url}` : `youtube:${resolved.videoId}`;
  const sourceElement = resolved?.kind === "youtube" ? resolved.element : null;
  const length = sourceKey && audioDuration ? audioDuration : duration;

  useEffect(() => {
    rateRef.current = rate;
    loopRef.current = loop;
    audioRef.current?.setRate(rate);
  }, [rate, loop]);

  useEffect(() => {
    if (!sourceKey) return;
    const [kind, ...rest] = sourceKey.split(":");
    const value = rest.join(":");
    if (kind === "youtube" && !sourceElement) return;
    const media = createMedia(kind === "audio" ? { kind: "audio", url: value } : { kind: "youtube", videoId: value, element: sourceElement! }, {
      onDuration: (seconds) => setAudioDuration(seconds),
      onEnded: () => setPlaying(false),
      onBlocked: () => setPlaying(false),
    });
    media.setRate(rateRef.current);
    media.seek(timeRef.current);
    audioRef.current = media;
    return () => {
      media.destroy();
      audioRef.current = null;
    };
  }, [sourceKey, sourceElement]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const audio = audioRef.current;
      const currentLoop = loopRef.current;
      let next: number;
      if (audio) {
        next = audio.time();
        if (currentLoop && next >= currentLoop.end) {
          audio.seek(currentLoop.start);
          next = currentLoop.start;
        }
      } else {
        next = timeRef.current + ((now - last) / 1000) * rateRef.current;
        if (currentLoop && next >= currentLoop.end) next = currentLoop.start;
        if (next >= length) {
          timeRef.current = length;
          setTime(length);
          setPlaying(false);
          return;
        }
      }
      last = now;
      timeRef.current = next;
      setTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, length]);

  const seek = useCallback(
    (to: number) => {
      const clamped = Math.min(Math.max(0, to), length);
      timeRef.current = clamped;
      audioRef.current?.seek(clamped);
      setTime(clamped);
    },
    [length],
  );

  const play = useCallback(() => {
    if (timeRef.current >= length) seek(0);
    void audioRef.current?.play();
    setPlaying(true);
  }, [length, seek]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  /** Current position read straight from the clock (for tap timing, where a render-old value is too late). */
  const now = useCallback(() => (audioRef.current ? audioRef.current.time() : timeRef.current), []);

  return { time, playing, rate, loop, duration: length, play, pause, seek, setRate, setLoop, now };
}
