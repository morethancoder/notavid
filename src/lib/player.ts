/**
 * Thin wrapper around the YouTube IFrame Player API.
 * https://developers.google.com/youtube/iframe_api_reference
 */

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Minimal typings for the parts of the API we use.
declare namespace YT {
  class Player {
    constructor(el: HTMLElement | string, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getPlayerState(): number;
    getPlaybackRate(): number;
    setPlaybackRate(suggestedRate: number): void;
    getVideoData(): { title: string; video_id: string; author: string };
    loadVideoById(videoId: string): void;
    cueVideoById(videoId: string): void;
    destroy(): void;
  }
  interface PlayerOptions {
    videoId?: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: { target: Player }) => void;
      onStateChange?: (e: { target: Player; data: number }) => void;
    };
  }
}

export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

let apiPromise: Promise<void> | null = null;

function loadIframeApi(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiPromise;
}

export interface VideoPlayer {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  currentTime(): number;
  isPlaying(): boolean;
  videoTitle(): string;
  playbackRate(): number;
  setPlaybackRate(rate: number): void;
  loadVideo(videoId: string): void;
  destroy(): void;
}

export async function createPlayer(
  el: HTMLElement,
  videoId: string,
  callbacks: {
    onReady?: () => void;
    onStateChange?: (state: number) => void;
  } = {},
): Promise<VideoPlayer> {
  await loadIframeApi();
  let ready = false;
  const player: YT.Player = await new Promise((resolve) => {
    const p = new window.YT!.Player(el, {
      videoId,
      width: "100%",
      height: "100%",
      playerVars: {
        rel: 0,
        modestbranding: 1,
        // Required for pause/play control from JS on some embeds
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          ready = true;
          callbacks.onReady?.();
          resolve(p);
        },
        onStateChange: (e) => callbacks.onStateChange?.(e.data),
      },
    });
  });

  return {
    play: () => ready && player.playVideo(),
    pause: () => ready && player.pauseVideo(),
    seek: (s) => ready && player.seekTo(s, true),
    currentTime: () => (ready ? player.getCurrentTime() : 0),
    isPlaying: () => ready && player.getPlayerState() === PlayerState.PLAYING,
    videoTitle: () => (ready ? (player.getVideoData()?.title ?? "") : ""),
    playbackRate: () => (ready ? player.getPlaybackRate() : 1),
    setPlaybackRate: (rate) => ready && player.setPlaybackRate(rate),
    loadVideo: (id) => ready && player.cueVideoById(id),
    destroy: () => player.destroy(),
  };
}
