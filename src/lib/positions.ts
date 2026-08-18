/**
 * Per-video resume positions, persisted in localStorage. The map is cached
 * so the 250ms save poll doesn't re-parse the whole store on every write.
 */
const KEY = "notavid:positions";

let cache: Record<string, number> | null = null;

function map(): Record<string, number> {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    } catch {
      cache = {};
    }
  }
  return cache!;
}

export function savePosition(videoId: string, seconds: number) {
  const m = map();
  // The first seconds aren't worth resuming to; near-start also clears a
  // stale entry after the user rewinds to the beginning.
  if (seconds > 5) m[videoId] = Math.floor(seconds);
  else delete m[videoId];
  localStorage.setItem(KEY, JSON.stringify(m));
}

/** Where to resume a video, backed up a moment to re-play the last beat. */
export function resumeTime(videoId: string): number {
  return Math.max(0, (map()[videoId] ?? 0) - 2);
}
