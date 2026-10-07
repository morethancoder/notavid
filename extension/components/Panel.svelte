<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import Editor from "./Editor.svelte";
  import History from "./History.svelte";
  import Transcript from "./Transcript.svelte";
  import Settings from "./Settings.svelte";
  import Icon from "./Icon.svelte";
  import { AutoPause } from "../lib/autopause.svelte";
  import { notes, downloadNote, wordCount, type Note } from "../lib/notes.svelte";
  import { settings, t } from "../lib/settings.svelte";
  import { imageFiles } from "../lib/images";
  import { formatTime, mainVideo, readVideoMeta, watchUrl } from "../lib/youtube";
  import type { PageState } from "../lib/page.svelte";
  import "../styles/notavid.css";

  let { page }: { page: PageState } = $props();

  type Tab = "notes" | "transcript" | "history";

  const autoPause = new AutoPause();
  let tab = $state<Tab>("notes");
  let showSettings = $state(false);
  let editorRef = $state<Editor | null>(null);
  let copied = $state(false);

  const note = $derived(page.videoId ? notes.get(page.videoId) : undefined);
  const words = $derived(note ? wordCount(note.body) : 0);

  // ---- saving ------------------------------------------------------------
  // Edits are batched briefly; the pending note carries its own video id, so a
  // flush after navigating away still lands on the right note.
  let pending: Note | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function onchange(markdown: string, videoId = page.videoId) {
    if (!videoId) return;
    // A late save from the previous video's editor must not swallow this one.
    if (pending && pending.videoId !== videoId) flush();
    const base = pending?.videoId === videoId ? pending : notes.get(videoId);
    if (!pending && markdown === (base?.body ?? "")) return;
    // Read title/channel now, while the page still shows this video.
    const meta = readVideoMeta(videoId);
    const now = new Date().toISOString();
    pending = {
      videoId,
      title: meta?.title ?? base?.title ?? videoId,
      channel: meta?.channel ?? base?.channel ?? "",
      body: markdown,
      createdAt: base?.createdAt ?? now,
      updatedAt: now,
    };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }

  /** The note's latest text, including an edit still waiting to be saved. */
  function bodyOf(videoId: string): string {
    return pending?.videoId === videoId ? pending.body : (notes.get(videoId)?.body ?? "");
  }

  function flush() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const next = pending;
    pending = null;
    if (!next) return;
    // An emptied note leaves the history rather than lingering as a blank row.
    if (next.body.trim()) notes.put(next);
    else notes.remove(next.videoId);
  }

  $effect(() => {
    void page.videoId;
    return () => {
      flush();
      autoPause.cancel();
    };
  });

  const onPageHide = () => {
    editorRef?.sync();
    flush();
  };
  window.addEventListener("pagehide", onPageHide);
  onDestroy(() => {
    window.removeEventListener("pagehide", onPageHide);
    editorRef?.sync();
    flush();
    autoPause.destroy();
  });

  // ---- clock: video time for the timestamp pill, lyrics, resume countdown ---
  let videoTime = $state(0);
  let now = $state(Date.now());
  const clock = setInterval(() => {
    if (document.hidden || settings.collapsed) return;
    now = Date.now();
    videoTime = mainVideo()?.currentTime ?? 0;
  }, 250);
  onDestroy(() => clearInterval(clock));

  // Restart the clock the moment a countdown begins, so it never shows a stale second.
  $effect(() => {
    if (autoPause.resumeAt) now = Date.now();
  });
  const resumeIn = $derived(
    autoPause.resumeAt ? Math.max(0, Math.ceil((autoPause.resumeAt - now) / 1000)) : null,
  );

  // ---- actions -------------------------------------------------------------
  function insertTimestamp() {
    const video = mainVideo();
    if (!video || !page.videoId) return;
    const seconds = video.currentTime;
    editorRef?.insertMarkdown(`[${formatTime(seconds)}](${watchUrl(page.videoId, seconds)})`);
  }

  function seekTo(seconds: number) {
    const video = mainVideo();
    if (!video) return;
    autoPause.cancel();
    video.currentTime = seconds;
    videoTime = seconds;
    // Jumping to a timestamp means "watch from here".
    video.play().catch(() => {});
  }

  /** A lyric line goes to the end of the note as a quote, stamped with its time. */
  function addLyricLine(text: string, seconds: number) {
    const videoId = page.videoId;
    if (!videoId) return;
    editorRef?.sync();
    flush();
    const body = (notes.get(videoId)?.body ?? "").trimEnd();
    const line = `> [${formatTime(seconds)}](${watchUrl(videoId, seconds)}) ${text}`;
    onchange(body ? `${body}\n\n${line}` : line);
    flush();
  }

  function toggleAuto() {
    settings.autoPause = !settings.autoPause;
    settings.save();
    if (!settings.autoPause) autoPause.cancel();
  }

  function openTab(name: Tab) {
    tab = name;
    if (settings.collapsed) toggleCollapsed();
  }

  function toggleCollapsed() {
    settings.collapsed = !settings.collapsed;
    settings.save();
  }

  function toggleSettings() {
    showSettings = !showSettings;
    if (showSettings && settings.collapsed) toggleCollapsed();
  }

  async function copyMarkdown() {
    if (!note) return;
    await navigator.clipboard.writeText(note.body);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  // ---- dropping images anywhere on the panel -------------------------------
  // The editor takes drops on its text itself; this catches the rest of the
  // panel, which would otherwise let Chrome navigate away to the image file.
  let dragDepth = $state(0);
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");

  function ondragenter(e: DragEvent) {
    if (hasFiles(e)) dragDepth++;
  }
  function ondragleave(e: DragEvent) {
    if (hasFiles(e)) dragDepth = Math.max(0, dragDepth - 1);
  }
  function ondragover(e: DragEvent) {
    if (hasFiles(e)) e.preventDefault();
  }
  async function ondrop(e: DragEvent) {
    dragDepth = 0;
    if (e.defaultPrevented || !hasFiles(e)) return;
    e.preventDefault();
    const files = imageFiles(e.dataTransfer?.files);
    if (!files.length || !page.videoId) return;
    if (tab !== "notes" || settings.collapsed) {
      openTab("notes");
      showSettings = false;
      await tick();
    }
    editorRef?.insertImages(files);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="nv panel"
  data-theme={page.dark ? "dark" : "light"}
  data-layout={page.layout}
  dir={settings.dir}
  lang={settings.locale}
  style:height={settings.collapsed ? "auto" : `${page.height}px`}
  {ondragenter}
  {ondragleave}
  {ondragover}
  {ondrop}
>
  <header>
    <span class="brand-mark" title={t("appName")}><Icon name="play" size={16} /></span>
    <span class="wordmark">{t("appName")}</span>
    <div class="tabs" role="tablist">
      <button class="chip" role="tab" aria-selected={tab === "notes"} data-tab="notes" onclick={() => openTab("notes")}>
        {t("notes")}
      </button>
      <button class="chip" role="tab" aria-selected={tab === "transcript"} data-tab="transcript" onclick={() => openTab("transcript")}>
        {t("transcript")}
      </button>
      <button class="chip" role="tab" aria-selected={tab === "history"} data-tab="history" onclick={() => openTab("history")}>
        {t("history")}
        {#if notes.all.length}<span class="count">{notes.all.length}</span>{/if}
      </button>
    </div>
    <button class="icon-btn" title={t("settings")} aria-label={t("settings")} aria-expanded={showSettings} onclick={toggleSettings}>
      <Icon name="settings" size={20} />
    </button>
    <button
      class="icon-btn"
      title={settings.collapsed ? t("expand") : t("collapse")}
      aria-label={settings.collapsed ? t("expand") : t("collapse")}
      onclick={toggleCollapsed}
    >
      <Icon name={settings.collapsed ? "expandMore" : "expandLess"} size={22} />
    </button>
  </header>

  {#if !settings.collapsed}
    {#if tab === "notes"}
      <div class="control-bar">
        <div class="status" class:holding={autoPause.holding} title={t("autoPauseOnHint")}>
          {#if autoPause.holding}
            <span class="dot pulsing"></span>
            <span class="status-text">
              {t("pausedWriting")}{#if resumeIn != null}&nbsp;— <span class="resuming">{t("resumingIn", { n: resumeIn })}</span>{/if}
            </span>
          {:else if settings.autoPause}
            <span class="dot"></span>
            <span class="status-text">{t("autoPauseOn")}</span>
          {:else}
            <span class="dot off"></span>
            <span class="status-text">{t("autoPauseOff")}</span>
          {/if}
        </div>
        <button class="pill stamp" title={t("insertTimestamp")} onclick={insertTimestamp}>
          <Icon name="schedule" size={16} />
          <span class="time">{formatTime(videoTime)}</span>
        </button>
        <button
          class="toggle auto"
          class:on={settings.autoPause}
          role="switch"
          aria-checked={settings.autoPause}
          aria-label={t("toggleAutoPause")}
          title={t("toggleAutoPause")}
          onclick={toggleAuto}
        >
          <span class="knob"></span>
        </button>
      </div>
      <div class="body">
        {#if notes.ready && page.videoId}
          {#key page.videoId + settings.locale}
            <Editor
              bind:this={editorRef}
              value={bodyOf(page.videoId)}
              noteId={page.videoId}
              placeholder={t("placeholder")}
              {onchange}
              onactivity={() => autoPause.activity()}
              oneditorblur={() => autoPause.blur()}
              ontimestampclick={seekTo}
              ontimestampshortcut={insertTimestamp}
            />
          {/key}
        {/if}
      </div>
      {#if note}
        <footer>
          <span class="words">{t(words === 1 ? "word" : "words", { n: words.toLocaleString(settings.locale) })}</span>
          <span class="spacer"></span>
          <button class="pill square" title={copied ? t("copied") : t("copy")} aria-label={t("copy")} onclick={copyMarkdown}>
            <Icon name={copied ? "check" : "copy"} size={16} />
          </button>
          <button class="pill square" title={t("download")} aria-label={t("download")} onclick={() => note && downloadNote(note)}>
            <Icon name="download" size={16} />
          </button>
        </footer>
      {/if}
    {:else if tab === "transcript"}
      <div class="body">
        {#if page.videoId}
          <Transcript videoId={page.videoId} time={videoTime} onseek={seekTo} onaddline={addLyricLine} />
        {/if}
      </div>
    {:else}
      <div class="body">
        <History currentVideoId={page.videoId} />
      </div>
    {/if}

    {#if showSettings}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="sheet-scrim" onclick={(e) => e.target === e.currentTarget && (showSettings = false)}>
        <div
          class="sheet"
          role="dialog"
          aria-label={t("settings")}
          tabindex="-1"
          onkeydown={(e) => e.key === "Escape" && (showSettings = false)}
        >
          <div class="sheet-head">
            <h2>{t("settings")}</h2>
            <button class="icon-btn" aria-label={t("close")} title={t("close")} onclick={() => (showSettings = false)}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <Settings />
        </div>
      </div>
    {/if}

    {#if dragDepth > 0}
      <div class="drop-hint"><Icon name="image" size={28} />{t("image")}</div>
    {/if}
  {/if}
</div>

<style>
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin-bottom: 16px;
    border: 1px solid var(--yt-border);
    border-radius: 12px;
    overflow: hidden;
    container-type: inline-size;
  }
  .panel[data-layout="narrow"] {
    margin-top: 12px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 6px 8px 12px;
    border-bottom: 1px solid var(--yt-border);
  }
  .panel[dir="rtl"] header {
    padding: 8px 12px 8px 6px;
  }
  .wordmark {
    margin-inline-end: 6px;
  }
  /* Narrow columns keep the red mark and drop the wordmark. */
  @container (max-width: 400px) {
    .wordmark {
      display: none;
    }
  }
  .tabs {
    display: flex;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .tabs .chip {
    padding: 0 10px;
  }
  .count {
    font-size: 11.5px;
    opacity: 0.7;
  }

  .control-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--yt-border);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    color: var(--yt-text-secondary);
  }
  .status.holding {
    color: var(--yt-text);
  }
  .status-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .resuming {
    font-variant-numeric: tabular-nums;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  footer {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-top: 1px solid var(--yt-border);
  }
  .words {
    font-size: 12px;
    color: var(--yt-text-secondary);
  }
  .spacer {
    flex: 1;
  }

  .sheet-scrim {
    position: absolute;
    inset: 49px 0 0;
    z-index: 20;
    background: var(--yt-scrim);
  }
  .sheet {
    max-height: 100%;
    overflow-y: auto;
    background: var(--yt-menu);
    border-radius: 0 0 16px 16px;
    box-shadow: var(--yt-shadow);
    outline: none;
  }
  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 8px 2px 16px;
  }
  .panel[dir="rtl"] .sheet-head {
    padding: 10px 16px 2px 8px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }

  .drop-hint {
    position: absolute;
    inset: 49px 8px 8px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 2px dashed var(--yt-blue);
    border-radius: 12px;
    background: color-mix(in srgb, var(--yt-base) 85%, transparent);
    color: var(--yt-blue);
    font-weight: 500;
    /* Drops go through to the editor below, which places the image where the pointer is. */
    pointer-events: none;
  }
</style>
