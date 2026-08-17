# Notavid

Take notes from YouTube videos without fighting the pause button.

Paste a YouTube link, get the video with a markdown editor underneath. The
moment you start typing, the video pauses; a few seconds after you stop, it
resumes. No more juggling the spacebar between the video tab and your notes.

## Features

- **Auto-pause / auto-resume** — typing pauses the video; it resumes after a
  configurable quiet delay (1–10s, default 3s). A video you paused manually
  stays paused. Toggle the whole behavior off with one switch.
- **Live markdown editor** — Milkdown Crepe: type `#`, `**bold**`, lists, code
  fences and they render in place.
- **Timestamps** — the ⏱ button (or ⌘⇧T) inserts a link to the current video
  position. Clicking a timestamp in a note seeks the video. The links are
  plain `youtu.be/...?t=N` URLs, so they also work anywhere else.
- **One note per video** — the sidebar lists notes with the video thumbnail,
  word count, and date. Pasting a link you already have notes for opens the
  existing note.
- **Folders** — group notes into folders. Drag a note onto a folder to move
  it there (long-press to drag on touch screens), or drag it out to the list
  to un-file it; the ⋮ menu does the same.
- **Plain `.md` files** — notes live in `~/Documents/Notavid/` with YAML
  frontmatter (title, video URL, created/updated). Readable in Obsidian or any
  editor, syncable however you like. Titles are fetched from the player itself,
  no API key needed.
- **YouTube's design language** — Material-style UI built on YouTube's own
  tokens (light `#fff`/`#606060`, dark `#0f0f0f`/`#212121`/`#aaa`, red only on
  high-intent actions), Roboto typography, pill buttons and chips, Material
  icon set.
- **Settings** — theme (light / dark / follow system) and language
  (English / العربية / follow system) with full RTL layout for Arabic, plus
  auto-pause defaults. All preferences persist.

## Stack

Svelte 5 + SvelteKit (static, SPA) + Tauri 2. The YouTube IFrame Player API
drives playback control. In the browser (`make web`) notes fall back to
localStorage so the UI is testable without the native shell.

## Commands

```sh
make            # list all targets
make setup      # check tools + install dependencies
make dev        # run the native app with hot reload
make web        # browser-only dev server (localStorage notes)
make check      # svelte-check + cargo check
make build      # release .app/.dmg under src-tauri/target
make clean      # remove rust + frontend build caches (frees several GB)
```
