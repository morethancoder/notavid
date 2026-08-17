export interface Note {
  slug: string;
  title: string;
  videoId: string;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
  body: string;
}

/**
 * Notes are plain .md files with a flat YAML frontmatter block so they stay
 * readable in Obsidian or any text editor. Only flat `key: value` string
 * pairs are used — no nested YAML.
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

export function parseNote(slug: string, raw: string): Note {
  const fallback: Note = {
    slug,
    title: slug,
    videoId: "",
    createdAt: "",
    updatedAt: "",
    body: raw,
  };
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return fallback;

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        // keep raw value
      }
    }
    fields[key] = value;
  }

  const videoId = fields.video ? extractIdFromStored(fields.video) : "";
  return {
    slug,
    title: fields.title || slug,
    videoId,
    createdAt: fields.created || "",
    updatedAt: fields.updated || "",
    body: raw.slice(match[0].length).replace(/^\n/, ""),
  };
}

function extractIdFromStored(stored: string): string {
  const m = stored.match(/([A-Za-z0-9_-]{11})(?:[?&#]|$)/);
  return m ? m[1] : "";
}

export function wordCount(body: string): number {
  const text = body
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // keep link text, drop URLs
    .replace(/[#>*_`~\-|]/g, " ");
  const words = text.match(/\S+/g);
  return words ? words.length : 0;
}

/** "folder/name" → "folder"; "name" → null. */
export function folderOf(slug: string): string | null {
  const idx = slug.indexOf("/");
  return idx === -1 ? null : slug.slice(0, idx);
}

/** "folder/name" → "name"; "name" → "name". */
export function baseOf(slug: string): string {
  const idx = slug.indexOf("/");
  return idx === -1 ? slug : slug.slice(idx + 1);
}

/** Join a folder (or null for root) with a base slug. */
export function inFolder(folder: string | null, base: string): string {
  return folder ? `${folder}/${base}` : base;
}

/**
 * Folder names become directory names; mirror the backend's rule
 * (unicode letters/digits, dash, underscore — spaces collapse to dashes).
 */
export function sanitizeFolderName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_]/gu, "")
    .slice(0, 60);
}

export function slugify(title: string, videoId: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return base ? `${base}-${videoId}` : videoId;
}
