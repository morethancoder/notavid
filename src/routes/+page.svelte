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
  import { savePosition, resumeTime } from "$lib/positions";
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

  // Bumped whenever the current player is torn down, so a stale in-flight
  // createPlayer can't install itself after a reload.
  let playerGen = 0;
  let playerLoadFailed = $state(false);
  let loadTimer: ReturnType<typeof setTimeout> | null = null;
  // True while a cue for a different video is in flight — position saves are
  // suppressed so the old video's time can't be stored under the new key.
  let cueing = false;

  /** Persist the playback position of the video the player currently holds. */
  function saveCurrentPosition() {
    if (player && playerVideoId && !cueing) savePosition(playerVideoId, player.currentTime());
  }

  async function showVideo(videoId: string) {
    if (playerVideoId === videoId) return;
    saveCurrentPosition();
    playerVideoId = videoId;
    if (playerPromise) {
      const gen = playerGen;
      try {
        const existing = await playerPromise;
        // Torn down while parked here; reloadPlayer re-cues by itself.
        if (gen !== playerGen) return;
        cueing = true;
        existing.loadVideo(videoId, resumeTime(videoId));
        // Title for a cued video arrives via the CUED state change.
      } catch {
        if (gen === playerGen) {
          playerPromise = null;
          playerLoadFailed = true;
        }
      }
      return;
    }
    const gen = playerGen;
    playerLoadFailed = false;
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      if (gen === playerGen && !player) playerLoadFailed = true;
    }, 10000);
    const mount = document.createElement("div");
    playerHost.appendChild(mount);
    playerPromise = createPlayer(
      mount,
      videoId,
      {
        onReady: () => resolveTitle(),
        onStateChange: (s) => {
          autoPause.onPlayerState(s);
          if (s === PlayerState.CUED || s === PlayerState.PLAYING) {
            cueing = false;
            resolveTitle();
          }
          if (s === PlayerState.PAUSED) saveCurrentPosition();
        },
      },
      { startSeconds: resumeTime(videoId) },
    );
    try {
      const created = await playerPromise;
      if (gen !== playerGen) {
        created.destroy();
        return;
      }
      player = created;
      playerLoadFailed = false;
      if (loadTimer) clearTimeout(loadTimer);
      autoPause.setPlayer(player);
    } catch {
      // Player creation failed outright (e.g. the API script didn't load).
      if (gen !== playerGen) return;
      if (loadTimer) clearTimeout(loadTimer);
      playerPromise = null;
      playerHost.replaceChildren();
      playerLoadFailed = true;
    }
  }

  /** Tear the player down and rebuild it (load failures, changed embed options). */
  function reloadPlayer() {
    const id = playerVideoId;
    saveCurrentPosition();
    playerGen++;
    cueing = false;
    if (loadTimer) clearTimeout(loadTimer);
    player?.destroy();
    player = null;
    playerPromise = null;
    playerVideoId = null;
    playerLoadFailed = false;
    autoPause.setPlayer(null);
    playerHost?.replaceChildren();
    if (id) showVideo(id);
  }

  /**
   * Fresh notes are created before we know the video's title (no API key
   * needed — the player itself knows it). Once known, retitle the note and
   * move it to a human-readable filename.
   */
  async function resolveTitle() {
    // Pair the title with the video the player actually holds — during a
    // switch, playerVideoId already points at the next video.
    const title = player?.videoTitle();
    const heldVideoId = player?.videoId();
    if (!title || !heldVideoId) return;
    const note = notes.find((n) => n.videoId === heldVideoId);
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
    if (!player) return;
    player.seek(seconds);
    // Jumping to a timestamp means "watch from here" — start playback.
    player.play();
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
      if (showShortcuts) showShortcuts = false;
      else if (showSettings) showSettings = false;
      else if (sidebarOpen) sidebarOpen = false;
    }
  }

  // ---- player / notes split (desktop) ----------------------------------
  const MIN_PLAYER_H = 150;
  const MIN_PLAYER_W = 260;

  function clampPlayerHeight(h: number): number {
    return Math.round(Math.min(Math.max(h, MIN_PLAYER_H), window.innerHeight * 0.75));
  }

  function clampPlayerWidth(w: number): number {
    return Math.round(Math.min(Math.max(w, MIN_PLAYER_W), window.innerWidth * 0.7));
  }

  function toggleLayout() {
    settings.sideBySide = !settings.sideBySide;
    settings.save();
  }

  function toggleSwap() {
    settings.swapPanes = !settings.swapPanes;
    settings.save();
  }

  let resizing = $state(false);

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
    // The handle resizes height in the stacked layout, width side-by-side.
    // With swapped panes the video sits on the other side of the handle,
    // so the drag direction inverts.
    const sideways = settings.sideBySide;
    const swap = settings.swapPanes ? -1 : 1;
    const start = sideways ? e.clientX : e.clientY;
    const startSize = sideways ? playerHost.offsetWidth : playerHost.offsetHeight;
    const sign = (sideways && settings.dir === "rtl" ? -1 : 1) * swap;
    trackDrag(
      (ev) => {
        const delta = ((sideways ? ev.clientX : ev.clientY) - start) * sign;
        if (sideways) settings.playerWidth = clampPlayerWidth(startSize + delta);
        else settings.playerHeight = clampPlayerHeight(startSize + delta);
      },
      () => {
        resizing = false;
        settings.save();
      },
    );
  }
  function resetPlayerSize() {
    if (settings.sideBySide) settings.playerWidth = null;
    else settings.playerHeight = null;
    settings.save();
  }
  function handleResizerKeydown(e: KeyboardEvent) {
    const swap = settings.swapPanes ? -1 : 1;
    if (settings.sideBySide) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const sign = (settings.dir === "rtl" ? -1 : 1) * swap;
      const base = settings.playerWidth ?? playerHost.offsetWidth;
      settings.playerWidth = clampPlayerWidth(base + (e.key === "ArrowRight" ? 24 : -24) * sign);
    } else {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const base = settings.playerHeight ?? playerHost.offsetHeight;
      settings.playerHeight = clampPlayerHeight(base + (e.key === "ArrowDown" ? 24 : -24) * swap);
    }
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

  // ---- note column width (line length) ----------------------------------
  const DEFAULT_NOTE_W = 760;

  function clampNoteWidth(w: number): number {
    return Math.round(Math.min(Math.max(w, 420), 1600));
  }

  let noteResizing = $state(false);

  function startNoteResize(e: PointerEvent) {
    e.preventDefault();
    noteResizing = true;
    const startX = e.clientX;
    const startW = settings.editorWidth ?? DEFAULT_NOTE_W;
    const sign = settings.dir === "rtl" ? -1 : 1;
    trackDrag(
      (ev) => {
        // The column is centered, so it grows on both sides of the handle.
        settings.editorWidth = clampNoteWidth(startW + (ev.clientX - startX) * 2 * sign);
      },
      () => {
        noteResizing = false;
        settings.save();
      },
    );
  }
  function resetNoteWidth() {
    settings.editorWidth = null;
    settings.save();
  }
  function handleNoteResizerKeydown(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const sign = settings.dir === "rtl" ? -1 : 1;
    const delta = (e.key === "ArrowRight" ? 32 : -32) * sign;
    settings.editorWidth = clampNoteWidth((settings.editorWidth ?? DEFAULT_NOTE_W) + delta);
    settings.save();
  }

  // ---- player extras ----------------------------------------------------
  let showShortcuts = $state(false);

  function handleWindowClick(e: MouseEvent) {
    if (showShortcuts && !(e.target as HTMLElement).closest(".shortcut-wrap")) {
      showShortcuts = false;
    }
  }

  // ---- clock: drives the resume countdown and the timestamp button ----
  let now = $state(Date.now());
  $effect(() => {
    const interval = setInterval(() => {
      now = Date.now();
      // Polled rather than listening for window blur: focus can sit inside
      // the YouTube iframe, where the window never gets another blur event
      // when the user then switches away from the app.
      if (settings.pauseOnBlur && !document.hasFocus() && player?.isPlaying()) {
        autoPause.cancel();
        player.pause();
      }
      if (now - lastPosWrite > 3000 && player?.isPlaying()) {
        lastPosWrite = now;
        saveCurrentPosition();
      }
    }, 250);
    return () => clearInterval(interval);
  });
  let lastPosWrite = 0;
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
      saveCurrentPosition();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      player?.destroy();
    };
  });
</script>

<svelte:window onkeydown={handleGlobalKeydown} onclick={handleWindowClick} />

<div
  class="app"
  class:sidebar-open={sidebarOpen}
  class:sidebar-collapsed={settings.sidebarCollapsed}
  class:side-by-side={settings.sideBySide}
  class:swap-panes={settings.swapPanes}
  class:resizing
  class:sb-resizing={sidebarResizing}
  class:note-resizing={noteResizing}
  style:--sidebar-w={settings.sidebarWidth ? `${settings.sidebarWidth}px` : null}
  style:--note-w={settings.editorWidth ? `${settings.editorWidth}px` : null}
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
      style:--player-w={settings.playerWidth ? `${settings.playerWidth}px` : null}
    >
      <div class="video-frame" bind:this={playerHost}></div>
      {#if playerLoadFailed}
        <div class="player-error">
          <span>{t("playerLoadFailed")}</span>
          <button class="pill" onclick={reloadPlayer}>
            <Icon name="refresh" size={16} />
            {t("retry")}
          </button>
        </div>
      {/if}
    </div>

    {#if activeNote}
      <!-- A focusable, arrow-key-operable separator is the ARIA "window
           splitter" pattern; svelte's checker doesn't model it. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="player-resizer"
        class:hidden={playerHidden}
        role="separator"
        aria-orientation={settings.sideBySide ? "vertical" : "horizontal"}
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
            onclick={reloadPlayer}
            title={t("reloadPlayer")}
            aria-label={t("reloadPlayer")}
          >
            <Icon name="refresh" size={16} />
          </button>
          <button
            class="pill layout-pill"
            onclick={toggleLayout}
            title={settings.sideBySide ? t("layoutStacked") : t("layoutSideBySide")}
            aria-label={settings.sideBySide ? t("layoutStacked") : t("layoutSideBySide")}
            aria-pressed={settings.sideBySide}
          >
            <Icon name={settings.sideBySide ? "splitRows" : "splitColumns"} size={16} />
          </button>
          <button
            class="pill layout-pill"
            onclick={toggleSwap}
            title={t("swapPanes")}
            aria-label={t("swapPanes")}
            aria-pressed={settings.swapPanes}
          >
            <Icon name={settings.sideBySide ? "swapHoriz" : "swapVert"} size={16} />
          </button>
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
          <div class="shortcut-wrap">
            <button
              class="pill"
              onclick={() => (showShortcuts = !showShortcuts)}
              title={t("shortcutsTitle")}
              aria-label={t("shortcutsTitle")}
              aria-expanded={showShortcuts}
            >
              <Icon name="keyboard" size={16} />
            </button>
            {#if showShortcuts}
              <div class="shortcuts-pop">
                <h4>{t("shortcutsTitle")}</h4>
                <div class="shortcut-row"><kbd>Ctrl+Space</kbd><span>{t("shortcutPlayPause")}</span></div>
                <div class="shortcut-row"><kbd>Ctrl+H · Ctrl+L</kbd><span>{t("shortcutSeek")}</span></div>
                <div class="shortcut-row"><kbd>Ctrl+J · Ctrl+K</kbd><span>{t("shortcutSpeed")}</span></div>
                <div class="shortcut-row"><kbd>Ctrl+B</kbd><span>{t("shortcutSidebar")}</span></div>
                <div class="shortcut-row"><kbd>⌘⇧T / Ctrl+Shift+T</kbd><span>{t("shortcutTimestamp")}</span></div>
              </div>
            {/if}
          </div>
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
        <div class="editor-inner">
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
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <div
            class="note-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("resizeNote")}
            title={t("resizeNote")}
            tabindex="0"
            onpointerdown={startNoteResize}
            ondblclick={resetNoteWidth}
            onkeydown={handleNoteResizerKeydown}
          ></div>
        </div>
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
    position: relative;
  }
  .player-error {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    font-size: 0.85rem;
    text-align: center;
    padding: 1rem;
  }
  .player-error .pill {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }
  .player-error .pill:hover {
    background: rgba(255, 255, 255, 0.3);
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

  /* ---- side-by-side layout (desktop toggle) ---------------------------- */
  @media (min-width: 721px) {
    .app.side-by-side .main {
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    .app.side-by-side .control-bar {
      grid-row: 1;
      grid-column: 1 / -1;
    }
    .app.side-by-side .video-area {
      grid-row: 2;
      grid-column: 1;
      min-height: 0;
      /* Keep the 16:9 frame — flex-stretching it makes YouTube crop the
         video to fill the tall column. */
      align-items: flex-start;
      overflow: hidden;
      /* The stacked layout's black letterbox column would swallow the whole
         pane here; only the frame itself should be black. */
      background: none;
    }
    .app.side-by-side .player-resizer {
      grid-row: 2;
      grid-column: 2;
      height: auto;
      width: 10px;
      cursor: col-resize;
    }
    .app.side-by-side .player-resizer .grip {
      width: 4px;
      height: 44px;
    }
    .app.side-by-side .editor-area {
      grid-row: 2;
      grid-column: 3;
    }
    .app.side-by-side .hero {
      grid-row: 1 / -1;
      grid-column: 1 / -1;
    }
    /* Width-driven; height follows the 16:9 ratio. */
    .app.side-by-side .video-frame {
      width: var(--player-w, min(45vw, 820px));
      height: auto;
      max-width: none;
      background: #000;
    }
    .app.side-by-side.resizing {
      cursor: col-resize;
    }

    /* ---- swapped panes: notes first, video after ----------------------- */
    .app.swap-panes:not(.side-by-side) .editor-area {
      order: 1;
    }
    .app.swap-panes:not(.side-by-side) .control-bar {
      order: 2;
      border-bottom: none;
      border-top: 1px solid var(--yt-border);
    }
    .app.swap-panes:not(.side-by-side) .player-resizer {
      order: 3;
    }
    .app.swap-panes:not(.side-by-side) .video-area {
      order: 4;
    }
    .app.side-by-side.swap-panes .main {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }
    .app.side-by-side.swap-panes .editor-area {
      grid-column: 1;
    }
    .app.side-by-side.swap-panes .video-area {
      grid-column: 3;
    }

    /* With the sidebar collapsed, the floating reopen button sits over the
       control bar's start corner when that bar is the top row. */
    .app.sidebar-collapsed.side-by-side .control-bar {
      padding-inline-start: 58px;
    }
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
  .shortcut-wrap {
    position: relative;
    display: flex;
  }
  .shortcuts-pop {
    position: absolute;
    top: calc(100% + 8px);
    inset-inline-end: 0;
    z-index: 40;
    min-width: 250px;
    background: var(--yt-menu);
    color: var(--yt-text);
    border-radius: 12px;
    box-shadow: var(--yt-shadow);
    padding: 0.7rem 0.9rem 0.8rem;
  }
  .shortcuts-pop h4 {
    margin: 0 0 0.55rem;
    font-size: 0.8rem;
    font-weight: 500;
  }
  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--yt-text-secondary);
    padding: 0.18rem 0;
  }
  .shortcut-row kbd {
    font-family: inherit;
    font-size: 0.72rem;
    color: var(--yt-text);
    background: var(--yt-chip);
    border-radius: 5px;
    padding: 0.12rem 0.4rem;
    white-space: nowrap;
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
    overflow-x: hidden;
    padding: 1.25rem 2rem 4rem;
  }
  /* In-flow wrapper spanning the full scroll height, so the width handle
     stays alongside the note at every scroll position. */
  .editor-inner {
    position: relative;
    min-height: 100%;
  }
  .editor-inner > :global(*) {
    max-width: var(--note-w, 760px);
    margin: 0 auto;
  }
  .note-resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 8px;
    inset-inline-end: max(0px, calc(50% - var(--note-w, 760px) / 2 - 20px));
    border-radius: 4px;
    cursor: col-resize;
    touch-action: none;
  }
  .note-resizer:hover,
  .note-resizer:focus-visible,
  .app.note-resizing .note-resizer {
    background: var(--yt-chip-hover);
  }
  .note-resizer:focus-visible {
    outline: 2px solid var(--yt-blue);
    outline-offset: -2px;
  }
  .app.note-resizing {
    cursor: col-resize;
    user-select: none;
  }
  .app.note-resizing .video-frame :global(iframe) {
    pointer-events: none;
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
      padding: calc(0.4rem + var(--safe-top)) 0.6rem 0.4rem;
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
      padding-top: var(--safe-top);
      padding-bottom: var(--safe-bottom);
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
    .player-resizer,
    .layout-pill,
    .note-resizer,
    .shortcut-wrap {
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
      padding: 0.9rem 1rem calc(3rem + var(--safe-bottom));
    }
  }
</style>
