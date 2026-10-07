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

## Chrome extension

`extension/` brings the same idea to YouTube itself — no separate player. On
any watch page a Notavid panel, styled like the desktop app, sits at the top
of YouTube's right-hand column (under the video when the window is narrow):

- Flip the red switch and the video pauses while you type in the panel, then
  resumes after the quiet delay. Switch it off and the video is left alone.
- Live markdown editing (Milkdown Crepe), timestamps (the ⏱ pill or Alt+T),
  clickable `m:ss` times that seek the video.
- Right-click in a note for bold, italic, strikethrough, code, link, image,
  timestamp, heading, list and quote (Shift + right-click for the browser's
  own menu). Drop or paste image files into the note; they're scaled down and
  saved inside it.
- **Transcript** tab: the video's own transcript, read from YouTube's
  transcript panel (opened out of sight and closed again). It follows the
  video line by line; click a line to jump there, search it, or add a line to
  your note. For songs, the **Lyrics** chip shows lyrics from
  [LRCLIB](https://lrclib.net) with the same follow-along, a timing nudge and
  a search for when it picks the wrong song. It opens on lyrics when a song
  matched and YouTube only has auto-generated captions.
- **History** tab — every video you've taken notes on, with thumbnail and a
  search box; the toolbar popup shows the same list from any tab. Download a
  note as `.md` in the desktop app's format.
- Follows YouTube's light/dark theme. Language follows the browser (English or
  Arabic with RTL), or pick one in settings. Notes live in `chrome.storage.local`.

```sh
make extinstall  # build + open chrome://extensions, copy the folder path,
                 # and print the 3 clicks to load it (or the reload step)
make ext         # just build → extension/.output/chrome-mv3
make extdev      # opens Chrome (separate dev profile, kept in extension/.chrome-dev)
                 # on a YouTube video, with the extension rebuilt as you edit
make exttest     # end-to-end test on live YouTube (headless Chromium)
make extzip      # zip for the Chrome Web Store
```

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
make extinstall # build the Chrome extension and load it into Chrome (see above)
make clean      # remove rust + frontend + extension build caches (frees several GB)
```
