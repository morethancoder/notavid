/** Helpers for reading and driving the YouTube watch page from a content script. */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** The video id of the current watch page, or null on any other page. */
export function currentVideoId(): string | null {
  if (location.pathname !== "/watch") return null;
  const v = new URLSearchParams(location.search).get("v");
  return v && ID_RE.test(v) ? v : null;
}

/** YouTube's main <video> element (the content script shares the page DOM). */
export function mainVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>("#movie_player video.html5-main-video");
}

function watchFlexy(): HTMLElement | null {
  return document.querySelector<HTMLElement>("ytd-watch-flexy");
}

/**
 * Title and channel of `videoId`, read from the page. Only trusted once the
 * watch page reports that video, so a note never picks up the previous
 * video's title mid-navigation.
 */
export function readVideoMeta(videoId: string): { title: string; channel: string } | null {
  if (watchFlexy()?.getAttribute("video-id") !== videoId) return null;
  const title =
    document.querySelector("ytd-watch-metadata h1")?.textContent?.trim() ||
    document.title.replace(/^\(\d+\)\s*/, "").replace(/ - YouTube$/, "").trim();
  if (!title) return null;
  const channel =
    document.querySelector("ytd-watch-metadata ytd-channel-name a")?.textContent?.trim() ?? "";
  return { title, channel };
}

export type Layout = "default" | "theater" | "narrow";

/**
 * Where the panel should live: the top of the right-hand column, or — when
 * YouTube collapses to one column — above the description.
 */
export function panelAnchor(): { el: HTMLElement; layout: Layout } | null {
  const flexy = watchFlexy();
  if (!flexy) return null;
  if (flexy.hasAttribute("is-two-columns_")) {
    const el = flexy.querySelector<HTMLElement>("#secondary-inner") ?? flexy.querySelector("#secondary");
    if (el) return { el, layout: flexy.hasAttribute("theater") ? "theater" : "default" };
  }
  const below = flexy.querySelector<HTMLElement>("#below");
  return below ? { el: below, layout: "narrow" } : null;
}

export function playerHeight(): number {
  return document.querySelector("#movie_player")?.getBoundingClientRect().height ?? 0;
}

export function watchUrl(videoId: string, seconds?: number): string {
  return seconds != null
    ? `https://youtu.be/${videoId}?t=${Math.floor(seconds)}`
    : `https://youtu.be/${videoId}`;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/** Seconds → "12:34" or "1:02:03". */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
