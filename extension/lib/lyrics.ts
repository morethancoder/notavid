import { browser } from "wxt/browser";
import { mainVideo, readVideoMeta } from "./youtube";

/**
 * Lyrics from LRCLIB (lrclib.net): free, keyless, and most entries carry
 * line timings, so the current line can follow the video.
 */

export interface LyricLine {
  /** Seconds into the track. */
  time: number;
  text: string;
}

export interface Lyrics {
  id: number;
  track: string;
  artist: string;
  /** Track length in seconds, per LRCLIB. */
  duration: number;
  instrumental: boolean;
  /** Timed lines, when LRCLIB has them. */
  synced: LyricLine[] | null;
  plain: string | null;
}

/** What a video remembers: the chosen lyrics and the user's timing shift. */
export interface SavedLyrics {
  lyrics: Lyrics;
  /** Seconds added to every line time; positive shows lines later. */
  offset: number;
}

interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

const API = "https://lrclib.net/api";
const PREFIX = "lyrics:";

async function request(params: Record<string, string>): Promise<LrclibRecord[]> {
  const url = `${API}/search?${new URLSearchParams(params)}`;
  // LRCLIB asks clients to identify themselves.
  const client = `Notavid extension v${browser.runtime.getManifest().version} (https://github.com/morethancoder/notavid)`;
  const res = await fetch(url, { headers: { "Lrclib-Client": client } });
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return (await res.json()) as LrclibRecord[];
}

/** "[01:02.34] line" → timed lines; metadata tags ([ar:…]) are skipped. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const [, m, s] of stamps) lines.push({ time: Number(m) * 60 + Number(s), text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

function toLyrics(r: LrclibRecord): Lyrics {
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : null;
  return {
    id: r.id,
    track: r.trackName,
    artist: r.artistName,
    duration: r.duration,
    instrumental: r.instrumental,
    synced: synced?.length ? synced : null,
    plain: r.plainLyrics,
  };
}

const hasLyrics = (r: LrclibRecord) => r.instrumental || !!r.syncedLyrics || !!r.plainLyrics;

/** Strip "(Official Video)", "[4K]", "ft. X", "| Label" and quotes from a title part. */
function cleanPart(s: string): string {
  return s
    .replace(/\s*[([【「][^)\]】」]*[)\]】」]/g, " ")
    .replace(/\s+(?:ft\.?|feat\.?|featuring|prod\.?)\s.*$/i, "")
    .replace(/\s*\|.*$/, "")
    .replace(/["“”«»]/g, "")
    .replace(/\s+(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|lyric video|visuali[sz]er|mv)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best guess at artist and track from a YouTube title and channel:
 * "Artist - Track (Official Video)" on most music videos, or just the track
 * title on auto-generated "Artist - Topic" channels.
 */
export function guessSong(title: string, channel: string): { artist: string; track: string; query: string } {
  const parts = title.split(/\s+[-–—]\s+/);
  const channelArtist = channel
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/\s+(?:official|music)$/i, "")
    .trim();
  const artist = cleanPart(parts.length > 1 ? parts[0]! : channelArtist);
  const track = cleanPart(parts.length > 1 ? parts.slice(1).join(" - ") : title);
  return { artist, track, query: cleanPart([artist, track].filter(Boolean).join(" ")) };
}

/**
 * The record that fits the video best: closest length, timed lines preferred.
 * A track far shorter or longer than the video is a different song (or the
 * video isn't music at all), so it's rejected.
 */
function pickBest(records: LrclibRecord[], videoDuration: number): LrclibRecord | null {
  const limit = Math.max(30, videoDuration * 0.25);
  let best: LrclibRecord | null = null;
  let bestScore = Infinity;
  for (const r of records) {
    if (!hasLyrics(r)) continue;
    const diff = videoDuration > 0 ? Math.abs(r.duration - videoDuration) : 0;
    if (videoDuration > 0 && diff > limit) continue;
    const score = diff + (r.syncedLyrics ? 0 : 15);
    if (score < bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/** Find lyrics for a video from its title, channel and length (0 = unknown). */
export async function findLyrics(title: string, channel: string, videoDuration: number): Promise<Lyrics | null> {
  const { artist, track, query } = guessSong(title, channel);
  const attempts: Record<string, string>[] = [];
  if (artist && track) attempts.push({ track_name: track, artist_name: artist });
  if (query) attempts.push({ q: query });
  // Without a known length there's nothing to reject a loose match with.
  if (videoDuration > 0 && track && track !== query) attempts.push({ q: track });
  // One failed request shouldn't sink the lookup; only report an error when
  // nothing got through at all.
  let failures = 0;
  for (const params of attempts) {
    let records: LrclibRecord[];
    try {
      records = await request(params).catch(() => request(params));
    } catch {
      failures++;
      continue;
    }
    const best = pickBest(records, videoDuration);
    if (best) return toLyrics(best);
  }
  if (failures === attempts.length) throw new Error("LRCLIB unreachable");
  return null;
}

/** Free-text search for the "wrong song?" picker. */
export async function searchLyrics(query: string): Promise<Lyrics[]> {
  const records = await request({ q: query });
  return records.filter(hasLyrics).slice(0, 12).map(toLyrics);
}

export async function loadSavedLyrics(videoId: string): Promise<SavedLyrics | null> {
  const items = await browser.storage.local.get(PREFIX + videoId);
  return (items[PREFIX + videoId] as SavedLyrics | undefined) ?? null;
}

export async function saveLyrics(videoId: string, saved: SavedLyrics) {
  await browser.storage.local.set({ [PREFIX + videoId]: saved });
}

export interface LyricsLookup {
  saved: SavedLyrics | null;
  /** The search the lookup used, to prefill "wrong song?". */
  query: string;
  /** LRCLIB couldn't be reached. */
  error: boolean;
}

// One lookup per video per page session, shared by the tab's "which view
// first?" decision and the lyrics view itself. Failed lookups aren't kept.
const lookups = new Map<string, Promise<LyricsLookup>>();

/** Saved lyrics for the video, or a fresh LRCLIB search from its title. */
export function lookupLyrics(videoId: string): Promise<LyricsLookup> {
  let lookup = lookups.get(videoId);
  if (!lookup) {
    lookup = runLookup(videoId);
    lookups.set(videoId, lookup);
    lookup.then((r) => r.error && lookups.delete(videoId));
  }
  return lookup;
}

async function runLookup(videoId: string): Promise<LyricsLookup> {
  const cached = await loadSavedLyrics(videoId);
  // Right after a navigation the page may still show the previous video's
  // title; readVideoMeta only answers once it matches.
  let meta = readVideoMeta(videoId);
  for (let i = 0; !meta && i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    meta = readVideoMeta(videoId);
  }
  const query = meta ? guessSong(meta.title, meta.channel).query : "";
  if (cached) return { saved: cached, query, error: false };
  if (!meta) return { saved: null, query, error: false };
  try {
    const video = mainVideo();
    // During an ad the <video> holds the ad, not the song.
    const ad = document.querySelector("#movie_player")?.classList.contains("ad-showing");
    const lyrics = await findLyrics(meta.title, meta.channel, ad || !video ? 0 : video.duration || 0);
    const saved = lyrics ? { lyrics, offset: 0 } : null;
    if (saved) saveLyrics(videoId, saved);
    return { saved, query, error: false };
  } catch {
    return { saved: null, query, error: true };
  }
}

/** The user picked a song or shifted its timing: store it and keep the session cache in step. */
export function rememberLyrics(videoId: string, saved: SavedLyrics, query: string) {
  lookups.set(videoId, Promise.resolve({ saved, query, error: false }));
  saveLyrics(videoId, saved);
}

/** Index of the line playing at `time` (seconds of video), or -1 before the first. */
export function activeLine(lines: LyricLine[], time: number, offset: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.time + offset <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
