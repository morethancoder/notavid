import { invoke, isTauri } from "@tauri-apps/api/core";

export interface StoredFile {
  slug: string;
  content: string;
  modifiedMs: number;
}

export interface NoteStore {
  list(): Promise<StoredFile[]>;
  read(slug: string): Promise<string>;
  write(slug: string, content: string): Promise<void>;
  delete(slug: string): Promise<void>;
  listFolders(): Promise<string[]>;
  createFolder(name: string): Promise<void>;
  /** Reveal the note's file in the system file manager; no-op in browser. */
  reveal(slug: string): Promise<void>;
  /** Open the notes root folder in the system file manager; no-op in browser. */
  openDir(): Promise<void>;
  /** Whether reveal/openDir actually do something (i.e. running in Tauri). */
  canReveal: boolean;
}

interface RustNoteFile {
  slug: string;
  content: string;
  modified_ms: number;
}

const tauriStore: NoteStore = {
  async list() {
    const files = await invoke<RustNoteFile[]>("list_notes");
    return files.map((f) => ({
      slug: f.slug,
      content: f.content,
      modifiedMs: f.modified_ms,
    }));
  },
  read: (slug) => invoke<string>("read_note", { slug }),
  write: (slug, content) => invoke("write_note", { slug, content }),
  delete: (slug) => invoke("delete_note", { slug }),
  listFolders: () => invoke<string[]>("list_folders"),
  createFolder: (name) => invoke("create_folder", { name }),
  reveal: (slug) => invoke("reveal_note", { slug }),
  openDir: () => invoke("open_notes_dir"),
  canReveal: true,
};

// Browser fallback so the app also works (and is testable) outside Tauri.
const PREFIX = "notavid:note:";

const localStore: NoteStore = {
  async list() {
    const files: StoredFile[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      const { content, modifiedMs } = JSON.parse(raw);
      files.push({ slug: key.slice(PREFIX.length), content, modifiedMs });
    }
    return files;
  },
  async read(slug) {
    const raw = localStorage.getItem(PREFIX + slug);
    if (raw == null) throw new Error(`note not found: ${slug}`);
    return JSON.parse(raw).content;
  },
  async write(slug, content) {
    localStorage.setItem(PREFIX + slug, JSON.stringify({ content, modifiedMs: Date.now() }));
  },
  async delete(slug) {
    localStorage.removeItem(PREFIX + slug);
  },
  // Folders in browser mode: empty ones live in a side key; non-empty ones
  // are implied by note slugs ("folder/name").
  async listFolders() {
    const stored: string[] = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "[]");
    const fromNotes = (await this.list())
      .map((f) => f.slug)
      .filter((s) => s.includes("/"))
      .map((s) => s.split("/")[0]);
    return [...new Set([...stored, ...fromNotes])].sort();
  },
  async createFolder(name) {
    const stored: string[] = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "[]");
    if (!stored.includes(name)) {
      stored.push(name);
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(stored));
    }
  },
  async reveal() {},
  async openDir() {},
  canReveal: false,
};

const FOLDERS_KEY = "notavid:folders";

export const store: NoteStore = isTauri() ? tauriStore : localStore;
