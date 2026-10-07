import { browser } from "wxt/browser";

/** One note per video, kept in chrome.storage.local under `note:<videoId>`. */
export interface Note {
  videoId: string;
  title: string;
  channel: string;
  body: string;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

const PREFIX = "note:";

/**
 * Every note, newest first, kept live across YouTube tabs and the popup via
 * storage change events — reading from here never waits on storage.
 */
class NoteStore {
  all = $state<Note[]>([]);
  ready = $state(false);

  constructor() {
    browser.storage.local.get(null).then((items) => {
      this.all = sortNotes(Object.entries(items).filter(([k]) => k.startsWith(PREFIX)).map(([, v]) => v as Note));
      this.ready = true;
    });
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      let next = this.all;
      for (const [key, change] of Object.entries(changes)) {
        if (!key.startsWith(PREFIX)) continue;
        const id = key.slice(PREFIX.length);
        next = next.filter((n) => n.videoId !== id);
        if (change.newValue) next.push(change.newValue as Note);
      }
      if (next !== this.all) this.all = sortNotes(next);
    });
  }

  get(videoId: string): Note | undefined {
    return this.all.find((n) => n.videoId === videoId);
  }

  async put(note: Note) {
    // Update the in-memory list right away; the change event confirms it.
    this.all = sortNotes([...this.all.filter((n) => n.videoId !== note.videoId), note]);
    await browser.storage.local.set({ [PREFIX + note.videoId]: note });
  }

  async remove(videoId: string) {
    this.all = this.all.filter((n) => n.videoId !== videoId);
    await browser.storage.local.remove(PREFIX + videoId);
  }
}

function sortNotes(notes: Note[]): Note[] {
  return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const notes = new NoteStore();

/**
 * Same .md shape the Notavid desktop app writes (flat YAML frontmatter), so a
 * downloaded note can be dropped straight into ~/Documents/Notavid.
 */
export function serializeNote(note: Note): string {
  const esc = (v: string) => (/[:#\n"]/.test(v) ? JSON.stringify(v) : v);
  return [
    "---",
    `title: ${esc(note.title)}`,
    `video: https://youtu.be/${note.videoId}`,
    `created: ${note.createdAt}`,
    `updated: ${note.updatedAt}`,
    "---",
    "",
    note.body,
  ].join("\n");
}

export function noteFilename(note: Note): string {
  const base = note.title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${base ? `${base}-${note.videoId}` : note.videoId}.md`;
}

export function downloadNote(note: Note) {
  const url = URL.createObjectURL(new Blob([serializeNote(note)], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = noteFilename(note);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Pasted and dropped images are inline data: URLs — never words or previews.
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;

export function wordCount(body: string): number {
  const text = body
    .replace(IMAGE_RE, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~\-|]/g, " ");
  return text.match(/\S+/g)?.length ?? 0;
}

/** First line of real text, for history previews. */
export function preview(body: string): string {
  return (
    body
      .replace(IMAGE_RE, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .split("\n")
      .map((l) => l.replace(/^[#>*\-\s\d.]+/, "").replace(/[*_`~]/g, "").trim())
      .find(Boolean) ?? ""
  );
}
