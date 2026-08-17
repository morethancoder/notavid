/**
 * Thin wrapper around the YouTube IFrame Player API.
 * https://developers.google.com/youtube/iframe_api_reference
 *
 * Two backends behind one interface:
 * - Direct IFrame API when the page has a real http(s) origin (dev server,
 *   Windows/Android `http://tauri.localhost`).
 * - A proxied player when the page runs on a custom scheme
 *   (`tauri://localhost` on macOS/Linux): YouTube rejects embeds without an
 *   HTTP referer (error 153), so the Rust side serves a wrapper page on
 *   127.0.0.1 and we drive it over postMessage.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

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

interface PlayerCallbacks {
  onReady?: () => void;
  onStateChange?: (state: number) => void;
}

export async function createPlayer(
  el: HTMLElement,
  videoId: string,
  callbacks: PlayerCallbacks = {},
): Promise<VideoPlayer> {
  if (isTauri() && !window.location.protocol.startsWith("http")) {
    return createProxyPlayer(el, videoId, callbacks);
  }
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

async function createProxyPlayer(
  el: HTMLElement,
  videoId: string,
  callbacks: PlayerCallbacks,
): Promise<VideoPlayer> {
  const port = await invoke<number>("embed_port");
  const origin = `http://127.0.0.1:${port}`;

  // The direct API path *replaces* `el` with the player iframe, so `el` never
  // needed dimensions; here the iframe nests inside it, so `el` must fill the
  // frame or the iframe's percentage height collapses.
  el.style.cssText = "width:100%;height:100%";
  const iframe = document.createElement("iframe");
  iframe.src = `${origin}/player?v=${encodeURIComponent(videoId)}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture; web-share";
  iframe.style.cssText = "width:100%;height:100%;border:0;display:block";
  el.appendChild(iframe);

  // Sync getters read the last snapshot the wrapper pushes (every 200ms and
  // on every state change), since postMessage can't answer synchronously.
  let snap = { time: 0, rate: 1, title: "", state: PlayerState.UNSTARTED as number };
  const send = (cmd: string, value?: number | string) =>
    iframe.contentWindow?.postMessage({ cmd, value }, origin);

  await new Promise<void>((resolve) => {
    window.addEventListener("message", function onMsg(e: MessageEvent) {
      if (e.origin !== origin || e.source !== iframe.contentWindow) return;
      const msg = e.data;
      if (msg?.type === "ready") {
        callbacks.onReady?.();
        resolve();
      } else if (msg?.type === "state") {
        callbacks.onStateChange?.(msg.data);
      } else if (msg?.type === "snap") {
        snap = msg;
      }
      // Listener stays for the iframe's lifetime; removed in destroy().
      if (!iframe.isConnected) window.removeEventListener("message", onMsg);
    });
  });

  return {
    play: () => send("play"),
    pause: () => send("pause"),
    seek: (s) => send("seek", s),
    currentTime: () => snap.time,
    isPlaying: () => snap.state === PlayerState.PLAYING,
    videoTitle: () => snap.title,
    playbackRate: () => snap.rate,
    setPlaybackRate: (rate) => send("rate", rate),
    loadVideo: (id) => send("cue", id),
    destroy: () => iframe.remove(),
  };
}
