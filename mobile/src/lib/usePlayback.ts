import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Something that makes the sound: an audio file or a YouTube video. */
export type Media = {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  time(): number;
  duration(): number;
  ended(): boolean;
};

export type Loop = { start: number; end: number } | null;

/** expo-audio player for a song's audio file (a web address or a file saved offline). */
export function useAudioMedia(uri: string | undefined): Media | null {
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const ended = useRef(false);
  ended.current = status.didJustFinish;
  return useMemo(
    () =>
      uri
        ? {
            play: () => player.play(),
            pause: () => player.pause(),
            seek: (seconds: number) => void player.seekTo(seconds),
            setRate: (rate: number) => player.setPlaybackRate(rate),
            time: () => player.currentTime,
            duration: () => player.duration,
            ended: () => ended.current,
          }
        : null,
    [uri, player],
  );
}

/**
 * The playback clock for the player: follows the media when there is one,
 * otherwise (demo songs without audio) a timer stands in for the music.
 */
export function usePlayback(fallbackDuration: number, media: Media | null, startTime = 0) {
  const [time, setTime] = useState(startTime);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [loop, setLoop] = useState<Loop>(null);
  const timeRef = useRef(startTime);
  const loopRef = useRef<Loop>(null);
  loopRef.current = loop;
  const mediaDuration = media?.duration() ?? 0;
  const duration = mediaDuration > 0 ? mediaDuration : fallbackDuration;

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const currentLoop = loopRef.current;
      let next: number;
      if (media) {
        next = media.time();
        if (currentLoop && next >= currentLoop.end) {
          media.seek(currentLoop.start);
          next = currentLoop.start;
        }
        if (media.ended()) {
          setPlaying(false);
          return;
        }
      } else {
        next = timeRef.current + ((now - last) / 1000) * rate;
        if (currentLoop && next >= currentLoop.end) next = currentLoop.start;
        if (next >= duration) {
          timeRef.current = duration;
          setTime(duration);
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
  }, [playing, media, rate, duration]);

  const seek = useCallback(
    (to: number) => {
      const clamped = Math.max(0, Math.min(duration, to));
      timeRef.current = clamped;
      media?.seek(clamped);
      setTime(clamped);
    },
    [media, duration],
  );

  const play = useCallback(() => {
    if (timeRef.current >= duration - 0.05) seek(0);
    media?.play();
    setPlaying(true);
  }, [media, duration, seek]);

  const pause = useCallback(() => {
    media?.pause();
    setPlaying(false);
  }, [media]);

  const setRate = useCallback(
    (next: number) => {
      media?.setRate(next);
      setRateState(next);
    },
    [media],
  );

  /** Position read straight from the media (a render-old value is too late for party sync). */
  const now = useCallback(() => (media ? media.time() : timeRef.current), [media]);

  // Stop the old sound when the song changes.
  useEffect(() => () => media?.pause(), [media]);

  return { time, playing, rate, loop, duration, play, pause, seek, setRate, setLoop, now };
}
