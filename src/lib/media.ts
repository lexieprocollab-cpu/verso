// Where a song's sound comes from. The playback clock (usePlayback) follows a
// Media: an <audio> element, or an embedded YouTube player for licensed songs
// that play from the label's official video (step 29).

export type Media = {
  play(): Promise<void>;
  pause(): void;
  /** Current position in seconds. */
  time(): number;
  seek(seconds: number): void;
  setRate(rate: number): void;
  destroy(): void;
};

export type MediaEvents = {
  onDuration(seconds: number): void;
  onEnded(): void;
  /** The browser refused to play (e.g. autoplay rules) or the media failed. */
  onBlocked(): void;
};

export type MediaSource = { kind: "audio"; url: string } | { kind: "youtube"; videoId: string; element: HTMLElement };

export function createAudioMedia(url: string, events: MediaEvents): Media {
  const audio = new Audio(url);
  audio.preload = "auto";
  const onMetadata = () => Number.isFinite(audio.duration) && events.onDuration(audio.duration);
  const onEnded = () => events.onEnded();
  audio.addEventListener("loadedmetadata", onMetadata);
  audio.addEventListener("ended", onEnded);
  return {
    play: () => audio.play().catch(() => events.onBlocked()),
    pause: () => audio.pause(),
    time: () => audio.currentTime,
    seek: (seconds) => {
      audio.currentTime = seconds;
    },
    setRate: (rate) => {
      audio.playbackRate = rate;
    },
    destroy: () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeAttribute("src");
    },
  };
}

// --- YouTube IFrame Player API (https://developers.google.com/youtube/iframe_api_reference)

type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
};
type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: () => void;
      };
    },
  ) => YouTubePlayer;
};
declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_ENDED = 0;
let youtubeApi: Promise<YouTubeNamespace> | null = null;

function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  youtubeApi ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      youtubeApi = null;
      reject(new Error("YouTube player could not load"));
    };
    document.head.appendChild(script);
  });
  return youtubeApi;
}

/** Only real YouTube video ids (11 characters) are embedded. */
export function isYouTubeId(value: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}

/**
 * The visible YouTube player drives the clock. Commands given before the
 * player is ready are queued. YouTube's terms require the player to stay
 * visible, so the video is shown above the lyrics, never hidden.
 */
export function createYouTubeMedia(videoId: string, element: HTMLElement, events: MediaEvents): Media {
  let player: YouTubePlayer | null = null;
  let destroyed = false;
  let pending: { time: number; rate: number; playing: boolean } = { time: 0, rate: 1, playing: false };
  const mount = document.createElement("div");
  element.replaceChildren(mount);

  loadYouTubeApi().then(
    (YT) => {
      if (destroyed) return;
      const created = new YT.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            player = created;
            const duration = created.getDuration();
            if (duration > 0) events.onDuration(duration);
            if (pending.time) created.seekTo(pending.time, true);
            if (pending.rate !== 1) created.setPlaybackRate(pending.rate);
            if (pending.playing) created.playVideo();
          },
          onStateChange: (event) => {
            if (event.data === YT_ENDED) events.onEnded();
            const duration = created.getDuration();
            if (duration > 0) events.onDuration(duration);
          },
          onError: () => events.onBlocked(),
        },
      });
    },
    () => events.onBlocked(),
  );

  return {
    play: async () => {
      pending.playing = true;
      player?.playVideo();
    },
    pause: () => {
      pending.playing = false;
      player?.pauseVideo();
    },
    time: () => (player ? player.getCurrentTime() : pending.time),
    seek: (seconds) => {
      pending.time = seconds;
      player?.seekTo(seconds, true);
    },
    setRate: (rate) => {
      pending.rate = rate;
      player?.setPlaybackRate(rate);
    },
    destroy: () => {
      destroyed = true;
      player?.destroy();
      pending = { time: 0, rate: 1, playing: false };
      element.replaceChildren();
    },
  };
}

export function createMedia(source: MediaSource, events: MediaEvents): Media {
  return source.kind === "audio" ? createAudioMedia(source.url, events) : createYouTubeMedia(source.videoId, source.element, events);
}
