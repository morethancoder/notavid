<script lang="ts">
  import { onMount } from "svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Editor from "$lib/components/Editor.svelte";
  import Settings from "$lib/components/Settings.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { store } from "$lib/storage";
  import {
    parseNote,
    serializeNote,
    slugify,
    wordCount,
    folderOf,
    baseOf,
    inFolder,
    sanitizeFolderName,
    type Note,
  } from "$lib/notes";
  import { parseVideoId, watchUrl, formatTime } from "$lib/youtube";
  import { createPlayer, PlayerState, type VideoPlayer } from "$lib/player";
  import { AutoPause } from "$lib/autopause.svelte";
  import { settings } from "$lib/settings.svelte";
  import { t } from "$lib/i18n.svelte";

  let notes = $state<Note[]>([]);
  let folders = $state<string[]>([]);
  let activeSlug = $state<string | null>(null);
  let loaded = $state(false);
  let showSettings = $state(false);
  // Mobile-only slide-in drawer; the toggle button is hidden on desktop.
  let sidebarOpen = $state(false);
  // Collapse the video to read notes full-height; the iframe stays mounted so
  // audio keeps playing. Session-only on purpose.
  let playerHidden = $state(false);

  const activeNote = $derived(notes.find((n) => n.slug === activeSlug) ?? null);
  const listItems = $derived(
    [...notes]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .map((n) => ({
        slug: n.slug,
        title: n.title === "Untitled" ? t("untitled") : n.title,
        videoId: n.videoId,
        words: wordCount(n.body),
        updatedAt: n.updatedAt,
      })),
  );

  // ---- player ----------------------------------------------------------
  let playerHost: HTMLDivElement;
  let player: VideoPlayer | null = $state(null);
  let playerPromise: Promise<VideoPlayer> | null = null;
  let playerVideoId: string | null = null;

  const autoPause = new AutoPause();

  async function showVideo(videoId: string) {
    if (playerVideoId === videoId) return;
    playerVideoId = videoId;
    if (playerPromise) {
      (await playerPromise).loadVideo(videoId);
      // Title for a cued video arrives via the CUED state change.
      return;
    }
    const mount = document.createElement("div");
    playerHost.appendChild(mount);
    playerPromise = createPlayer(mount, videoId, {
      onReady: () => resolveTitle(),
      onStateChange: (s) => {
        autoPause.onPlayerState(s);
        if (s === PlayerState.CUED || s === PlayerState.PLAYING) resolveTitle();
      },
    });
    player = await playerPromise;
    autoPause.setPlayer(player);
  }

  /**
   * Fresh notes are created before we know the video's title (no API key
   * needed — the player itself knows it). Once known, retitle the note and
   * move it to a human-readable filename.
   */
  async function resolveTitle() {
    const title = player?.videoTitle();
    if (!title) return;
    const note = notes.find((n) => n.videoId === playerVideoId);
    if (!note || note.title !== "Untitled") return;
    const newSlug = inFolder(folderOf(note.slug), slugify(title, note.videoId));
    const oldSlug = note.slug;
    note.title = title;
    if (newSlug !== oldSlug) {
      note.slug = newSlug;
      if (activeSlug === oldSlug) activeSlug = newSlug;
      await store.delete(oldSlug);
    }
    await store.write(note.slug, serializeNote($state.snapshot(note)));
  }

  // ---- persistence -----------------------------------------------------
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave: string | null = null; // slug awaiting write

  function scheduleSave(slug: string) {
    pendingSave = slug;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 800);
  }

  async function flushSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (!pendingSave) return;
    const note = notes.find((n) => n.slug === pendingSave);
    pendingSave = null;
    if (note) await store.write(note.slug, serializeNote($state.snapshot(note)));
  }

  function handleEditorChange(markdown: string) {
    if (!activeNote) return;
    activeNote.body = markdown;
    activeNote.updatedAt = new Date().toISOString();
    scheduleSave(activeNote.slug);
  }

  // ---- note lifecycle --------------------------------------------------
  function createNote(url: string): string | null {
    const videoId = parseVideoId(url);
    if (!videoId) return t("invalidLink");
    const existing = notes.find((n) => n.videoId === videoId);
    if (existing) {
      selectNote(existing.slug);
      return null;
    }
    const now = new Date().toISOString();
    const note: Note = {
      slug: videoId,
      title: "Untitled",
      videoId,
      createdAt: now,
      updatedAt: now,
      body: "",
    };
    notes.push(note);
    store.write(note.slug, serializeNote(note));
    selectNote(note.slug);
    return null;
  }

  async function selectNote(slug: string) {
    if (slug === activeSlug) return;
    await flushSave();
    activeSlug = slug;
    const note = notes.find((n) => n.slug === slug);
    if (note?.videoId) showVideo(note.videoId);
  }

  async function moveNote(slug: string, folder: string | null) {
    const note = notes.find((n) => n.slug === slug);
    if (!note) return;
    const newSlug = inFolder(folder, baseOf(slug));
    if (newSlug === slug || notes.some((n) => n.slug === newSlug)) return;
    await flushSave();
    note.slug = newSlug;
    if (activeSlug === slug) activeSlug = newSlug;
    await store.write(newSlug, serializeNote($state.snapshot(note)));
    await store.delete(slug);
  }

  function createFolder(name: string): boolean {
    const clean = sanitizeFolderName(name);
    if (!clean) return false;
    if (!folders.includes(clean)) {
      folders = [...folders, clean].sort();
      store.createFolder(clean);
    }
    return true;
  }

  async function deleteNote(slug: string) {
    if (pendingSave === slug) {
      pendingSave = null;
      if (saveTimer) clearTimeout(saveTimer);
    }
    notes = notes.filter((n) => n.slug !== slug);
    await store.delete(slug);
    if (activeSlug === slug) activeSlug = null;
  }

  // ---- timestamps ------------------------------------------------------
  let editorRef = $state<Editor | null>(null);

  function insertTimestamp() {
    if (!player || !activeNote) return;
    const seconds = player.currentTime();
    const link = `[${formatTime(seconds)}](${watchUrl(activeNote.videoId, seconds)})`;
    editorRef?.insertMarkdown(link);
  }

  function seekTo(seconds: number) {
    player?.seek(seconds);
  }

  // ---- playback shortcuts ----------------------------------------------
  const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  function togglePlay() {
    if (!player) return;
    if (player.isPlaying()) {
      // A deliberate pause must stay paused — kill any pending auto-resume.
      autoPause.cancel();
      player.pause();
    } else {
      player.play();
    }
  }

  function seekBy(delta: number) {
    if (!player) return;
    player.seek(Math.max(0, player.currentTime() + delta));
  }

  // setPlaybackRate is async in the iframe API; rapid presses would read a
  // stale rate. Track the requested rate until the player reports it applied.
  let pendingRate: number | null = null;

  function currentRate(): number {
    const actual = player?.playbackRate() ?? 1;
    if (pendingRate != null && Math.abs(actual - pendingRate) < 0.01) pendingRate = null;
    return pendingRate ?? actual;
  }

  function rateIndex(): number {
    const current = currentRate();
    const idx = RATES.findIndex((r) => Math.abs(r - current) < 0.01);
    return idx === -1 ? RATES.indexOf(1) : idx;
  }

  function setRate(rate: number) {
    pendingRate = rate;
    player?.setPlaybackRate(rate);
  }

  function changeRate(step: number) {
    if (!player) return;
    setRate(RATES[Math.min(Math.max(rateIndex() + step, 0), RATES.length - 1)]);
  }

  function cycleRate() {
    if (!player) return;
    setRate(RATES[(rateIndex() + 1) % RATES.length]);
  }

  function toggleSidebar() {
    if (window.matchMedia("(max-width: 720px)").matches) {
      sidebarOpen = !sidebarOpen;
    } else {
      settings.sidebarCollapsed = !settings.sidebarCollapsed;
      settings.save();
    }
  }

  /** Ctrl-only chords, chosen to stay usable while typing in the editor. */
  function handleShortcut(code: string): boolean {
    switch (code) {
      case "Space":
        togglePlay();
        return true;
      case "KeyH":
        seekBy(-10);
        return true;
      case "KeyL":
        seekBy(10);
        return true;
      case "KeyJ":
        changeRate(-1);
        return true;
      case "KeyK":
        changeRate(1);
        return true;
      case "KeyB":
        toggleSidebar();
        return true;
      default:
        return false;
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyT") {
      e.preventDefault();
      insertTimestamp();
      return;
    }
    if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && handleShortcut(e.code)) {
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      if (showSettings) showSettings = false;
      else if (sidebarOpen) sidebarOpen = false;
    }
  }

  // ---- player / notes split (desktop) ----------------------------------
  const MIN_PLAYER_H = 150;

  function clampPlayerHeight(h: number): number {
    return Math.round(Math.min(Math.max(h, MIN_PLAYER_H), window.innerHeight * 0.75));
  }

  let resizing = $state(false);
  let dragStartY = 0;
  let dragStartHeight = 0;

  /**
   * Drags listen on window, not the handle: the handle moves with the pane
   * as it resizes, and WKWebView's pointer capture on a moving 10px strip
   * is unreliable — the cursor escapes and the drag sticks.
   */
  function trackDrag(onMove: (e: PointerEvent) => void, onEnd: () => void) {
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      onEnd();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function startPlayerResize(e: PointerEvent) {
    e.preventDefault();
    resizing = true;
    dragStartY = e.clientY;
    dragStartHeight = playerHost.offsetHeight;
    trackDrag(
      (ev) => {
        settings.playerHeight = clampPlayerHeight(dragStartHeight + (ev.clientY - dragStartY));
      },
      () => {
        resizing = false;
        settings.save();
      },
    );
  }
  function resetPlayerSize() {
    settings.playerHeight = null;
    settings.save();
  }
  function handleResizerKeydown(e: KeyboardEvent) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const base = settings.playerHeight ?? playerHost.offsetHeight;
    settings.playerHeight = clampPlayerHeight(base + (e.key === "ArrowDown" ? 24 : -24));
    settings.save();
  }

  // ---- sidebar width (desktop) -----------------------------------------
  const DEFAULT_SIDEBAR_W = 290;

  function clampSidebarWidth(w: number): number {
    return Math.round(Math.min(Math.max(w, 220), Math.min(480, window.innerWidth * 0.5)));
  }

  let sidebarResizing = $state(false);
  let sbStartX = 0;
  let sbStartW = 0;

  function startSidebarResize(e: PointerEvent) {
    e.preventDefault();
    sidebarResizing = true;
    sbStartX = e.clientX;
    sbStartW = settings.sidebarWidth ?? DEFAULT_SIDEBAR_W;
    const sign = settings.dir === "rtl" ? -1 : 1;
    trackDrag(
      (ev) => {
        settings.sidebarWidth = clampSidebarWidth(sbStartW + (ev.clientX - sbStartX) * sign);
      },
      () => {
        sidebarResizing = false;
        settings.save();
      },
    );
  }
  function resetSidebarWidth() {
    settings.sidebarWidth = null;
    settings.save();
  }
  function handleSidebarResizerKeydown(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const sign = settings.dir === "rtl" ? -1 : 1;
    const delta = (e.key === "ArrowRight" ? 16 : -16) * sign;
    settings.sidebarWidth = clampSidebarWidth((settings.sidebarWidth ?? DEFAULT_SIDEBAR_W) + delta);
    settings.save();
  }

  // ---- clock: drives the resume countdown and the timestamp button ----
  let now = $state(Date.now());
  $effect(() => {
    const interval = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(interval);
  });
  const countdown = $derived(
    autoPause.resumeAt != null ? Math.max(0, Math.ceil((autoPause.resumeAt - now) / 1000)) : null,
  );
  const currentTimeLabel = $derived.by(() => {
    void now;
    return player ? formatTime(player.currentTime()) : "0:00";
  });
  // Polled off the same clock so it also tracks speed changes made in the
  // YouTube UI itself.
  const rateLabel = $derived.by(() => {
    void now;
    return player ? currentRate() : 1;
  });

  function handleDelayChange(e: Event) {
    settings.delaySeconds = Number((e.currentTarget as HTMLSelectElement).value);
    settings.save();
  }

  onMount(() => {
    (async () => {
      const [files, storedFolders] = await Promise.all([store.list(), store.listFolders()]);
      notes = files.map((f) => parseNote(f.slug, f.content));
      folders = storedFolders;
      loaded = true;
    })();
    const beforeUnload = () => {
      // Best-effort synchronous-ish flush when the window closes.
      flushSave();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      player?.destroy();
    };
  });
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div
  class="app"
  class:sidebar-open={sidebarOpen}
  class:sidebar-collapsed={settings.sidebarCollapsed}
  class:resizing
  class:sb-resizing={sidebarResizing}
  style:--sidebar-w={settings.sidebarWidth ? `${settings.sidebarWidth}px` : null}
>
  <header class="topbar">
    <button
      class="menu-btn"
      onclick={() => (sidebarOpen = !sidebarOpen)}
      aria-label={sidebarOpen ? t("closeNotes") : t("openNotes")}
      aria-expanded={sidebarOpen}
    >
      <Icon name="menu" size={22} />
    </button>
    <span class="topbar-brand">
      <span class="brand-mark"><Icon name="play" size={15} /></span>
      {t("appName")}
    </span>
  </header>

  <div class="sidebar-pane">
    <Sidebar
      notes={listItems}
      {folders}
      {activeSlug}
      canReveal={store.canReveal}
      onmove={moveNote}
      oncreatefolder={createFolder}
      onreveal={(slug) => store.reveal(slug)}
      onopendir={() => store.openDir()}
      onselect={(slug) => {
        sidebarOpen = false;
        selectNote(slug);
      }}
      oncreate={(url) => {
        const problem = createNote(url);
        if (!problem) sidebarOpen = false;
        return problem;
      }}
      ondelete={deleteNote}
      onsettings={() => {
        sidebarOpen = false;
        showSettings = true;
      }}
      oncollapse={toggleSidebar}
    />
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("resizeSidebar")}
      title={t("resizeSidebar")}
      tabindex="0"
      onpointerdown={startSidebarResize}
      ondblclick={resetSidebarWidth}
      onkeydown={handleSidebarResizerKeydown}
    ></div>
  </div>
  {#if sidebarOpen}
    <button class="scrim-btn" aria-label={t("closeNotes")} onclick={() => (sidebarOpen = false)}
    ></button>
  {/if}
  {#if settings.sidebarCollapsed}
    <button
      class="sidebar-reopen"
      onclick={toggleSidebar}
      title={t("showSidebar")}
      aria-label={t("showSidebar")}
    >
      <Icon name="menu" size={20} />
    </button>
  {/if}

  <main class="main">
    <div
      class="video-area"
      class:hidden={!activeNote || playerHidden}
      style:--player-h={settings.playerHeight ? `${settings.playerHeight}px` : null}
    >
      <div class="video-frame" bind:this={playerHost}></div>
    </div>

    {#if activeNote}
      <!-- A focusable, arrow-key-operable separator is the ARIA "window
           splitter" pattern; svelte's checker doesn't model it. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="player-resizer"
        class:hidden={playerHidden}
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("resizePlayer")}
        title={t("resizePlayer")}
        tabindex="0"
        onpointerdown={startPlayerResize}
        ondblclick={resetPlayerSize}
        onkeydown={handleResizerKeydown}
      >
        <span class="grip"></span>
      </div>

      <div class="control-bar">
        <div class="status" class:holding={autoPause.holding} title={t("shortcutsHint")}>
          {#if autoPause.holding}
            <span class="dot pulsing"></span>
            {t("pausedWriting")}{#if countdown != null}&nbsp;— {t("resumingIn", { n: countdown })}{/if}
          {:else if autoPause.enabled}
            <span class="dot"></span>
            {t("autoPauseOn")}
          {:else}
            <span class="dot off"></span>
            {t("autoPauseOff")}
          {/if}
        </div>
        <div class="controls">
          <button
            class="pill"
            onclick={() => (playerHidden = !playerHidden)}
            title={playerHidden ? t("showPlayer") : t("hidePlayer")}
            aria-label={playerHidden ? t("showPlayer") : t("hidePlayer")}
            aria-pressed={playerHidden}
          >
            <Icon name={playerHidden ? "expandMore" : "expandLess"} size={16} />
          </button>
          <button class="pill" onclick={cycleRate} title={t("playbackSpeed")}>
            <Icon name="speed" size={16} />
            <span class="time">{rateLabel}×</span>
          </button>
          <button class="pill" onclick={insertTimestamp} title={t("insertTimestamp")}>
            <Icon name="schedule" size={16} />
            <span class="time">{currentTimeLabel}</span>
          </button>
          <label class="delay">
            {t("resumeAfter")}
            <select value={settings.delaySeconds} onchange={handleDelayChange}>
              {#each [1, 2, 3, 5, 10] as d (d)}
                <option value={d}>{t("seconds", { n: d })}</option>
              {/each}
            </select>
          </label>
          <button
            class="toggle"
            class:on={autoPause.enabled}
            role="switch"
            aria-checked={autoPause.enabled}
            onclick={() => autoPause.toggleEnabled()}
            title={t("toggleAutoPause")}
          >
            <span class="knob"></span>
          </button>
        </div>
      </div>

      <div class="editor-area">
        <!-- Keyed on videoId (stable across the async retitle) so the editor
             isn't recreated mid-typing when the note file gets renamed.
             Locale is included so the placeholder language follows settings. -->
        {#key activeNote.videoId + settings.locale}
          <Editor
            bind:this={editorRef}
            value={activeNote.body}
            placeholder={t("editorPlaceholder")}
            onchange={handleEditorChange}
            onactivity={() => autoPause.activity()}
            oneditorblur={() => autoPause.blur()}
            ontimestampclick={seekTo}
          />
        {/key}
      </div>
    {:else if loaded}
      <div class="hero">
        <div class="hero-mark"><Icon name="play" size={30} /></div>
        <h2>{t("heroTitle")}</h2>
        <p>{t("heroBody")}</p>
      </div>
    {/if}
  </main>
</div>

{#if showSettings}
  <Settings onclose={() => (showSettings = false)} />
{/if}

<style>
  .app {
    display: grid;
    grid-template-columns: var(--sidebar-w, 290px) 1fr;
    height: 100dvh;
  }
  .topbar {
    display: none;
  }
  .sidebar-pane {
    position: relative;
    min-height: 0;
    height: 100%;
    min-width: 0;
  }
  .sidebar-resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    inset-inline-end: -3px;
    width: 7px;
    z-index: 10;
    cursor: col-resize;
    touch-action: none;
  }
  .sidebar-resizer:hover,
  .app.sb-resizing .sidebar-resizer {
    background: var(--yt-chip-hover);
  }
  .sidebar-resizer:focus-visible {
    outline: 2px solid var(--yt-blue);
    outline-offset: -2px;
  }
  .sidebar-reopen {
    position: fixed;
    top: 10px;
    inset-inline-start: 10px;
    z-index: 30;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: none;
    border-radius: 50%;
    background: var(--yt-raised);
    color: var(--yt-text);
    box-shadow: var(--yt-shadow);
    cursor: pointer;
  }
  .sidebar-reopen:hover {
    background: var(--yt-chip-hover);
  }
  /* Collapsed sidebar only exists on desktop; phones use the drawer. */
  @media (min-width: 721px) {
    .app.sidebar-collapsed {
      grid-template-columns: 1fr;
    }
    .app.sidebar-collapsed .sidebar-pane {
      display: none;
    }
  }
  .scrim-btn {
    display: none;
  }
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    background: var(--yt-base);
  }
  .video-area {
    background: #000;
    display: flex;
    justify-content: center;
    flex-shrink: 0;
  }
  .video-area.hidden {
    display: none;
  }
  /* Height-driven so the desktop drag handle can resize it; width follows
     the 16:9 ratio. The default matches the old 46vh / 900px-wide cap. */
  .video-frame {
    height: var(--player-h, min(46vh, 506px));
    aspect-ratio: 16 / 9;
    max-width: 100%;
  }
  .video-frame :global(iframe) {
    width: 100%;
    height: 100%;
    display: block;
    border: 0;
  }
  /* While dragging, don't let the iframe swallow pointer events. */
  .app.resizing .video-frame :global(iframe),
  .app.sb-resizing .video-frame :global(iframe) {
    pointer-events: none;
  }
  .app.resizing,
  .app.sb-resizing {
    user-select: none;
  }
  .app.resizing {
    cursor: row-resize;
  }
  .app.sb-resizing {
    cursor: col-resize;
  }
  .player-resizer.hidden {
    display: none;
  }

  .player-resizer {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 10px;
    flex-shrink: 0;
    background: var(--yt-base);
    border: none;
    cursor: row-resize;
    touch-action: none;
  }
  .player-resizer .grip {
    width: 44px;
    height: 4px;
    border-radius: 2px;
    background: var(--yt-chip-hover);
    transition: background 0.12s;
  }
  .player-resizer:hover .grip,
  .player-resizer:focus-visible .grip,
  .app.resizing .player-resizer .grip {
    background: var(--yt-text-secondary);
  }
  .player-resizer:focus-visible {
    outline: 2px solid var(--yt-blue);
    outline-offset: -2px;
  }

  .control-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 1.1rem;
    border-bottom: 1px solid var(--yt-border);
    background: var(--yt-base);
    flex-shrink: 0;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--yt-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .status.holding {
    color: var(--yt-text);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #2ba640;
    flex-shrink: 0;
  }
  .dot.off {
    background: var(--yt-text-secondary);
  }
  .dot.pulsing {
    background: var(--yt-red);
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--yt-chip);
    border: none;
    border-radius: 18px;
    color: var(--yt-text);
    font-size: 0.78rem;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
  }
  .pill:hover {
    background: var(--yt-chip-hover);
  }
  .time {
    font-variant-numeric: tabular-nums;
    direction: ltr;
  }
  .delay {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    color: var(--yt-text-secondary);
    white-space: nowrap;
  }
  .delay select {
    background: var(--yt-chip);
    color: var(--yt-text);
    border: none;
    border-radius: 14px;
    font-size: 0.78rem;
    font-family: inherit;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
  }
  .toggle {
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 11px;
    border: none;
    background: var(--yt-chip-hover);
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .toggle.on {
    background: var(--yt-red);
  }
  .knob {
    position: absolute;
    top: 3px;
    inset-inline-start: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }
  .toggle.on .knob {
    transform: translateX(16px);
  }
  :global([dir="rtl"]) .toggle.on .knob {
    transform: translateX(-16px);
  }

  .editor-area {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 2rem 4rem;
  }
  .editor-area > :global(*) {
    max-width: 760px;
    margin: 0 auto;
  }

  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2rem;
    gap: 0.4rem;
  }
  .hero-mark {
    display: grid;
    place-items: center;
    width: 72px;
    height: 50px;
    border-radius: 14px;
    background: var(--yt-red);
    color: #fff;
    margin-bottom: 0.8rem;
  }
  .hero h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .hero p {
    margin: 0;
    max-width: 400px;
    color: var(--yt-text-secondary);
    font-size: 0.9rem;
    line-height: 1.55;
  }

  /* ---- small screens: sidebar becomes a slide-in drawer --------------- */
  @media (max-width: 720px) {
    .app {
      display: flex;
      flex-direction: column;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.6rem;
      border-bottom: 1px solid var(--yt-border);
      background: var(--yt-base);
      flex-shrink: 0;
    }
    .menu-btn {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      background: none;
      color: var(--yt-text);
      cursor: pointer;
    }
    .menu-btn:hover {
      background: var(--yt-chip);
    }
    .topbar-brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.04em;
    }
    .topbar-brand .brand-mark {
      display: grid;
      place-items: center;
      width: 26px;
      height: 18px;
      border-radius: 5px;
      background: var(--yt-red);
      color: #fff;
    }

    .sidebar-pane {
      position: fixed;
      top: 0;
      bottom: 0;
      inset-inline-start: 0;
      width: min(320px, 86vw);
      z-index: 60;
      background: var(--yt-base);
      box-shadow: var(--yt-shadow);
      transform: translateX(-105%);
      transition: transform 0.2s ease;
    }
    :global([dir="rtl"]) .sidebar-pane {
      transform: translateX(105%);
    }
    .app.sidebar-open .sidebar-pane {
      transform: none;
    }
    .sidebar-resizer,
    .sidebar-reopen {
      display: none;
    }
    .scrim-btn {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 55;
      border: none;
      background: var(--yt-scrim);
      cursor: pointer;
    }

    .main {
      flex: 1;
    }
    /* Width-driven video on phones; the drag handle is hidden. */
    .video-frame {
      width: 100%;
      height: auto;
      max-height: none;
    }
    .player-resizer {
      display: none;
    }

    .control-bar {
      flex-wrap: wrap;
      gap: 0.35rem 0.75rem;
      padding: 0.45rem 0.75rem;
    }
    .controls {
      flex-wrap: wrap;
    }
    .editor-area {
      padding: 0.9rem 1rem 3rem;
    }
  }
</style>
