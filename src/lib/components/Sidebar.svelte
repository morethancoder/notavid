<script lang="ts">
  import { thumbnailUrl } from "$lib/youtube";
  import { folderOf } from "$lib/notes";
  import { t } from "$lib/i18n.svelte";
  import { settings } from "$lib/settings.svelte";
  import Icon from "./Icon.svelte";

  export interface NoteListItem {
    slug: string;
    title: string;
    videoId: string;
    words: number;
    updatedAt: string;
  }

  let {
    notes,
    folders,
    activeSlug,
    canReveal = false,
    onselect,
    oncreate,
    ondelete,
    onsettings,
    oncollapse,
    onmove,
    oncreatefolder,
    onreveal,
    onopendir,
  }: {
    notes: NoteListItem[];
    folders: string[];
    activeSlug: string | null;
    canReveal?: boolean;
    onselect: (slug: string) => void;
    oncreate: (url: string) => string | null;
    ondelete: (slug: string) => void;
    onsettings: () => void;
    oncollapse?: () => void;
    onmove: (slug: string, folder: string | null) => void;
    oncreatefolder: (name: string) => boolean;
    onreveal?: (slug: string) => void;
    onopendir?: () => void;
  } = $props();

  let urlInput = $state("");
  let error = $state("");

  function submit(e: Event) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    const problem = oncreate(urlInput);
    if (problem) {
      error = problem;
    } else {
      error = "";
      urlInput = "";
    }
  }

  // ---- tree grouping ---------------------------------------------------
  const rootNotes = $derived(notes.filter((n) => folderOf(n.slug) === null));
  const grouped = $derived(
    folders.map((name) => ({ name, notes: notes.filter((n) => folderOf(n.slug) === name) })),
  );
  let collapsedFolders = $state<Record<string, boolean>>({});

  function toggleFolder(name: string) {
    collapsedFolders[name] = !collapsedFolders[name];
  }

  // ---- new folder ------------------------------------------------------
  let creatingFolder = $state(false);
  let folderName = $state("");

  function submitFolder(e: Event) {
    e.preventDefault();
    if (!oncreatefolder(folderName)) {
      error = t("invalidFolderName");
      return;
    }
    error = "";
    folderName = "";
    creatingFolder = false;
  }

  // ---- drag & drop -----------------------------------------------------
  // Pointer-based instead of the HTML5 drag API: WKWebView (macOS/iOS) and
  // Android WebView both mishandle in-page HTML5 drags, and touch devices
  // never fire them at all. Mouse drags arm after a small movement
  // threshold; touch drags arm on long-press so the list still scrolls.
  const DRAG_THRESHOLD_PX = 6;
  const LONG_PRESS_MS = 300;

  let dragSlug = $state<string | null>(null);
  let dragTitle = $state("");
  let dragActive = $state(false);
  let dragX = $state(0);
  let dragY = $state(0);
  // null = root (no folder), string = folder name, undefined = not droppable.
  let dropTarget = $state<string | null | undefined>(undefined);
  // Suppresses the click that follows a completed drag on the same row.
  let didDrag = false;

  const dragFromFolder = $derived(dragSlug ? folderOf(dragSlug) : null);
  const dropOnRoot = $derived(
    dragActive && dropTarget === null && dragFromFolder !== null,
  );

  function updateDropTarget(x: number, y: number) {
    const el = document.elementFromPoint(x, y);
    const folderEl = el?.closest("[data-drop-folder]") as HTMLElement | null;
    if (folderEl) {
      dropTarget = folderEl.dataset.dropFolder!;
      return;
    }
    dropTarget = el?.closest("nav.note-list") ? null : undefined;
  }

  function startNoteDrag(e: PointerEvent, note: NoteListItem) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const touchLike = e.pointerType !== "mouse";
    const startX = e.clientX;
    const startY = e.clientY;
    let lastX = startX;
    let lastY = startY;
    let active = false;

    const activate = () => {
      active = true;
      didDrag = true;
      dragSlug = note.slug;
      dragTitle = note.title;
      dragActive = true;
      dragX = lastX;
      dragY = lastY;
      document.body.classList.add("notavid-dragging");
      updateDropTarget(lastX, lastY);
    };

    const pressTimer = touchLike ? setTimeout(activate, LONG_PRESS_MS) : null;

    // Once the drag is armed the finger owns it — stop the list scrolling.
    const suppressScroll = (te: TouchEvent) => {
      if (active) te.preventDefault();
    };

    const onMove = (ev: PointerEvent) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!active) {
        const dist = Math.hypot(lastX - startX, lastY - startY);
        if (touchLike) {
          // Finger moved before the long-press armed — it's a scroll.
          if (dist > 10) cleanup();
        } else if (dist > DRAG_THRESHOLD_PX) {
          activate();
        }
        return;
      }
      dragX = lastX;
      dragY = lastY;
      updateDropTarget(lastX, lastY);
    };

    const onUp = () => {
      if (active && dropTarget !== undefined && dropTarget !== folderOf(note.slug)) {
        onmove(note.slug, dropTarget);
      }
      cleanup();
    };

    const cleanup = () => {
      if (pressTimer) clearTimeout(pressTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("touchmove", suppressScroll);
      document.body.classList.remove("notavid-dragging");
      dragSlug = null;
      dragActive = false;
      dropTarget = undefined;
      // The suppressed click (if any) fires before this timeout runs.
      setTimeout(() => (didDrag = false));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("touchmove", suppressScroll, { passive: false });
  }

  function handleRowClick(slug: string) {
    if (didDrag) {
      didDrag = false;
      return;
    }
    onselect(slug);
  }

  // ---- per-note menu ---------------------------------------------------
  let menuSlug = $state<string | null>(null);

  function moveTo(slug: string, folder: string | null) {
    menuSlug = null;
    onmove(slug, folder);
  }

  // Two-step delete: first click arms, second click within 2.5s deletes.
  let confirmingSlug = $state<string | null>(null);
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  function handleDelete(slug: string) {
    if (confirmingSlug === slug) {
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmingSlug = null;
      ondelete(slug);
      return;
    }
    confirmingSlug = slug;
    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => (confirmingSlug = null), 2500);
  }

  const dateFmt = $derived(
    new Intl.DateTimeFormat(settings.locale, { month: "short", day: "numeric" }),
  );
  function formatDate(iso: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : dateFmt.format(d);
  }
</script>

{#snippet noteRow(note: NoteListItem)}
  <div
    class="row-wrap"
    class:active={note.slug === activeSlug}
    class:dragging={dragSlug === note.slug}
  >
    <button
      class="row"
      onclick={() => handleRowClick(note.slug)}
      onpointerdown={(e) => startNoteDrag(e, note)}
    >
      <img src={thumbnailUrl(note.videoId)} alt="" loading="lazy" draggable="false" />
      <span class="meta">
        <span class="title">{note.title}</span>
        <span class="stats">
          {note.words.toLocaleString(settings.locale)}
          {note.words === 1 ? t("word") : t("words")}
          {#if formatDate(note.updatedAt)}· {formatDate(note.updatedAt)}{/if}
        </span>
      </span>
    </button>
    <div class="row-actions">
      <button
        class="action"
        title={t("noteMenu")}
        aria-label={t("noteMenu")}
        aria-expanded={menuSlug === note.slug}
        onclick={() => (menuSlug = menuSlug === note.slug ? null : note.slug)}
      >
        <Icon name="moreVert" size={14} />
      </button>
      <button
        class="action delete"
        class:confirming={confirmingSlug === note.slug}
        title={confirmingSlug === note.slug ? t("deleteConfirmHint") : t("deleteNote")}
        aria-label={t("deleteNote")}
        onclick={() => handleDelete(note.slug)}
      >
        {#if confirmingSlug === note.slug}
          {t("deleteConfirm")}
        {:else}
          <Icon name="close" size={14} />
        {/if}
      </button>
    </div>
    {#if menuSlug === note.slug}
      <div class="menu" role="menu">
        <span class="menu-label">{t("moveToFolder")}</span>
        <button
          class="menu-item"
          role="menuitem"
          disabled={folderOf(note.slug) === null}
          onclick={() => moveTo(note.slug, null)}
        >
          {t("noFolder")}
        </button>
        {#each folders as f (f)}
          <button
            class="menu-item"
            role="menuitem"
            disabled={folderOf(note.slug) === f}
            onclick={() => moveTo(note.slug, f)}
          >
            <Icon name="folder" size={14} />
            {f}
          </button>
        {/each}
        {#if canReveal && onreveal}
          <hr />
          <button
            class="menu-item"
            role="menuitem"
            onclick={() => {
              menuSlug = null;
              onreveal(note.slug);
            }}
          >
            <Icon name="openInNew" size={14} />
            {t("revealInFiles")}
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<aside class="sidebar">
  <header class="brand">
    <span class="brand-mark"><Icon name="play" size={18} /></span>
    <h1>{t("appName")}</h1>
    {#if oncollapse}
      <button class="collapse-btn" onclick={oncollapse} title={t("hideSidebar")} aria-label={t("hideSidebar")}>
        <Icon name="menu" size={20} />
      </button>
    {/if}
  </header>

  <form class="new-note" onsubmit={submit}>
    <input
      type="text"
      placeholder={t("pasteLink")}
      bind:value={urlInput}
      oninput={() => (error = "")}
      spellcheck="false"
      dir="ltr"
    />
    <button type="submit" title={t("createNote")} aria-label={t("createNote")}>
      <Icon name="add" size={20} />
    </button>
    <button
      type="button"
      title={t("newFolder")}
      aria-label={t("newFolder")}
      aria-expanded={creatingFolder}
      onclick={() => (creatingFolder = !creatingFolder)}
    >
      <Icon name="newFolder" size={18} />
    </button>
  </form>
  {#if creatingFolder}
    <form class="new-note new-folder" onsubmit={submitFolder}>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        placeholder={t("folderNamePlaceholder")}
        bind:value={folderName}
        oninput={() => (error = "")}
        autofocus
      />
      <button type="submit" title={t("newFolder")} aria-label={t("newFolder")}>
        <Icon name="check" size={18} />
      </button>
    </form>
  {/if}
  {#if error}
    <p class="error">{error}</p>
  {/if}

  <nav class="note-list" class:drop-root={dropOnRoot}>
    {#each rootNotes as note (note.slug)}
      {@render noteRow(note)}
    {/each}

    {#each grouped as group (group.name)}
      <div class="folder">
        <button
          class="folder-head"
          class:drop-hover={dragActive &&
            dropTarget === group.name &&
            dragFromFolder !== group.name}
          data-drop-folder={group.name}
          onclick={() => toggleFolder(group.name)}
          aria-expanded={!collapsedFolders[group.name]}
        >
          <Icon name={collapsedFolders[group.name] ? "expandMore" : "expandLess"} size={16} />
          <Icon name="folder" size={16} />
          <span class="folder-name">{group.name}</span>
          <span class="folder-count">{group.notes.length.toLocaleString(settings.locale)}</span>
        </button>
        {#if !collapsedFolders[group.name]}
          <div
            class="folder-notes"
            class:drop-hover={dragActive &&
              dropTarget === group.name &&
              dragFromFolder !== group.name}
            data-drop-folder={group.name}
          >
            {#each group.notes as note (note.slug)}
              {@render noteRow(note)}
            {/each}
          </div>
        {/if}
      </div>
    {/each}

    {#if !notes.length && !folders.length}
      <p class="empty">
        {#each t("emptyList").split("\n") as line, i}
          {#if i > 0}<br />{/if}{line}
        {/each}
      </p>
    {/if}
  </nav>

  <footer class="sidebar-footer">
    <button class="settings-btn" onclick={onsettings}>
      <Icon name="settings" size={20} />
      <span>{t("settings")}</span>
    </button>
    {#if canReveal && onopendir}
      <button class="settings-btn" onclick={onopendir}>
        <Icon name="folder" size={20} />
        <span>{t("openNotesFolder")}</span>
      </button>
    {/if}
  </footer>
</aside>

{#if menuSlug}
  <button class="menu-backdrop" aria-label={t("close")} onclick={() => (menuSlug = null)}
  ></button>
{/if}

{#if dragActive}
  <div class="drag-ghost" style:left="{dragX + 14}px" style:top="{dragY + 14}px" aria-hidden="true">
    <Icon name="folder" size={14} />
    <span>{dragTitle}</span>
  </div>
{/if}

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--yt-base);
    border-inline-end: 1px solid var(--yt-border);
    overflow: hidden;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 1rem 0.85rem;
  }
  .brand-mark {
    display: grid;
    place-items: center;
    width: 30px;
    height: 21px;
    border-radius: 6px;
    background: var(--yt-red);
    color: #fff;
  }
  .brand h1 {
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -0.04em;
    margin: 0;
    flex: 1;
  }
  .collapse-btn {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--yt-text);
    cursor: pointer;
  }
  .collapse-btn:hover {
    background: var(--yt-chip);
  }
  /* On phones the drawer has its own hamburger in the top bar. */
  @media (max-width: 720px) {
    .collapse-btn {
      display: none;
    }
  }
  .new-note {
    display: flex;
    gap: 0.5rem;
    padding: 0 0.75rem 0.75rem;
  }
  .new-note input {
    flex: 1;
    min-width: 0;
    background: var(--yt-base);
    border: 1px solid var(--yt-border);
    border-radius: 18px;
    padding: 0.5rem 0.9rem;
    color: var(--yt-text);
    font-size: 0.85rem;
    font-family: inherit;
  }
  .new-note input::placeholder {
    color: var(--yt-text-secondary);
  }
  .new-note input:focus {
    outline: none;
    border-color: var(--yt-blue);
  }
  .new-note button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border: none;
    border-radius: 50%;
    background: var(--yt-chip);
    color: var(--yt-text);
    cursor: pointer;
  }
  .new-note button:hover {
    background: var(--yt-chip-hover);
  }
  .error {
    margin: 0;
    padding: 0 1rem 0.6rem;
    color: var(--yt-red);
    font-size: 0.78rem;
  }
  .note-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem 0.5rem 0.75rem;
  }

  .folder {
    margin-top: 0.15rem;
  }
  .folder-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.45rem 0.5rem;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--yt-text);
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    text-align: start;
  }
  .folder-head:hover {
    background: var(--yt-chip);
  }
  .folder-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .folder-count {
    color: var(--yt-text-secondary);
    font-size: 0.75rem;
    font-weight: 400;
  }
  .folder-notes {
    padding-inline-start: 0.9rem;
  }

  .row-wrap {
    position: relative;
    border-radius: 10px;
  }
  .row-wrap.active {
    background: var(--yt-active);
  }
  .row-wrap:not(.active):hover {
    background: var(--yt-chip);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    padding: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: start;
    color: inherit;
    border-radius: 10px;
  }
  .row img {
    width: 76px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 8px;
    background: var(--yt-chip);
    flex-shrink: 0;
    /* A native image drag would cancel our pointer-based note drag. */
    -webkit-user-drag: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  .title {
    font-size: 0.84rem;
    font-weight: 500;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .stats {
    font-size: 0.75rem;
    color: var(--yt-text-secondary);
  }

  .row-actions {
    position: absolute;
    top: 6px;
    inset-inline-end: 6px;
    display: flex;
    gap: 4px;
  }
  .action {
    display: grid;
    place-items: center;
    min-width: 24px;
    height: 24px;
    padding: 0 5px;
    border: none;
    border-radius: 12px;
    background: var(--yt-raised);
    color: var(--yt-text-secondary);
    font-size: 0.7rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .row-wrap:hover .action,
  .action.confirming,
  .action[aria-expanded="true"] {
    opacity: 1;
  }
  /* Touch screens have no hover — keep the buttons visible. */
  @media (hover: none) {
    .action {
      opacity: 1;
    }
  }
  .action:hover {
    color: var(--yt-text);
    background: var(--yt-chip-hover);
  }
  .action.delete.confirming {
    color: #fff;
    background: var(--yt-red);
    font-weight: 500;
  }

  .menu {
    position: absolute;
    top: 32px;
    inset-inline-end: 6px;
    z-index: 80;
    min-width: 170px;
    max-width: 240px;
    padding: 0.35rem 0;
    background: var(--yt-menu);
    border-radius: 10px;
    box-shadow: var(--yt-shadow);
  }
  .menu-label {
    display: block;
    padding: 0.3rem 0.85rem 0.2rem;
    font-size: 0.72rem;
    color: var(--yt-text-secondary);
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.85rem;
    border: none;
    background: none;
    color: var(--yt-text);
    font-size: 0.82rem;
    cursor: pointer;
    text-align: start;
  }
  .menu-item:hover:not(:disabled) {
    background: var(--yt-chip);
  }
  .menu-item:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .menu hr {
    border: none;
    border-top: 1px solid var(--yt-border);
    margin: 0.3rem 0;
  }
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    border: none;
    background: transparent;
    cursor: default;
  }

  /* ---- drag & drop ---- */
  .row-wrap.dragging {
    opacity: 0.4;
  }
  .folder-head.drop-hover,
  .folder-notes.drop-hover {
    background: var(--yt-active);
    outline: 1.5px dashed var(--yt-blue);
    outline-offset: -1.5px;
    border-radius: 10px;
  }
  .note-list.drop-root {
    outline: 1.5px dashed var(--yt-blue);
    outline-offset: -3px;
    border-radius: 12px;
  }
  .drag-ghost {
    position: fixed;
    z-index: 120;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 220px;
    padding: 0.35rem 0.65rem;
    background: var(--yt-menu);
    color: var(--yt-text);
    font-size: 0.8rem;
    border-radius: 8px;
    box-shadow: var(--yt-shadow);
    pointer-events: none;
  }
  .drag-ghost span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(body.notavid-dragging) {
    user-select: none;
    -webkit-user-select: none;
    cursor: grabbing;
  }

  .empty {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--yt-text-secondary);
    font-size: 0.82rem;
    line-height: 1.6;
  }
  .sidebar-footer {
    border-top: 1px solid var(--yt-border);
    padding: 0.5rem;
  }
  .settings-btn {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    padding: 0.55rem 0.75rem;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--yt-text);
    font-size: 0.85rem;
    cursor: pointer;
  }
  .settings-btn:hover {
    background: var(--yt-chip);
  }
</style>
