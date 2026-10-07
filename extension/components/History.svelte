<script lang="ts">
  import Icon from "./Icon.svelte";
  import { notes, downloadNote, preview, wordCount, type Note } from "../lib/notes.svelte";
  import { relativeTime } from "../lib/i18n";
  import { settings, t } from "../lib/settings.svelte";
  import { thumbnailUrl } from "../lib/youtube";

  let {
    currentVideoId = null,
    linkTarget = "_self",
  }: {
    currentVideoId?: string | null;
    linkTarget?: "_self" | "_blank";
  } = $props();

  let query = $state("");
  let confirming = $state<string | null>(null);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes.all;
    return notes.all.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.channel.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q),
    );
  });

  function stats(note: Note): string {
    const n = wordCount(note.body);
    return [
      note.videoId === currentVideoId && t("current"),
      t(n === 1 ? "word" : "words", { n: n.toLocaleString(settings.locale) }),
      relativeTime(settings.locale, note.updatedAt),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function remove(note: Note) {
    if (confirming !== note.videoId) {
      confirming = note.videoId;
      return;
    }
    confirming = null;
    notes.remove(note.videoId);
  }
</script>

<div class="history">
  <label class="field-input search">
    <Icon name="search" size={18} />
    <input type="search" placeholder={t("search")} bind:value={query} dir="auto" />
  </label>

  {#if notes.ready && notes.all.length === 0}
    <p class="empty">{t("emptyHistory")}</p>
  {:else if notes.ready && filtered.length === 0}
    <p class="empty">{t("noMatches")}</p>
  {/if}

  <ul>
    {#each filtered as note (note.videoId)}
      <li class:current={note.videoId === currentVideoId}>
        <a class="row" href={`https://www.youtube.com/watch?v=${note.videoId}`} target={linkTarget}>
          <img src={thumbnailUrl(note.videoId)} alt="" loading="lazy" draggable="false" />
          <span class="meta">
            <span class="title" dir="auto">{note.title}</span>
            <span class="stats">{stats(note)}</span>
            {#if preview(note.body)}<span class="snippet" dir="auto">{preview(note.body)}</span>{/if}
          </span>
        </a>
        <div class="actions">
          <button class="action" title={t("download")} aria-label={t("download")} onclick={() => downloadNote(note)}>
            <Icon name="download" size={14} />
          </button>
          <button
            class="action delete"
            class:confirming={confirming === note.videoId}
            title={confirming === note.videoId ? t("deleteConfirmHint") : t("delete")}
            aria-label={t("delete")}
            onclick={() => remove(note)}
            onmouseleave={() => confirming === note.videoId && (confirming = null)}
          >
            {#if confirming === note.videoId}
              {t("deleteConfirm")}
            {:else}
              <Icon name="close" size={14} />
            {/if}
          </button>
        </div>
      </li>
    {/each}
  </ul>
</div>

<style>
  .history {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .search {
    margin: 10px 12px 6px;
  }
  .empty {
    margin: 24px 16px;
    color: var(--yt-text-secondary);
    text-align: center;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 2px 6px 8px;
    overflow-y: auto;
    flex: 1;
  }
  li {
    position: relative;
    border-radius: 10px;
  }
  li.current {
    background: var(--yt-active);
  }
  li:not(.current):hover {
    background: var(--yt-chip);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    color: inherit;
    text-decoration: none;
    border-radius: 10px;
  }
  img {
    width: 88px;
    aspect-ratio: 16 / 9;
    flex: none;
    border-radius: 8px;
    object-fit: cover;
    background: var(--yt-chip);
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .title {
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .stats,
  .snippet {
    font-size: 12px;
    color: var(--yt-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .actions {
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
    padding: 0 6px;
    border: none;
    border-radius: 12px;
    background: var(--yt-raised);
    color: var(--yt-text-secondary);
    font-size: 11.5px;
    box-shadow: 0 0 0 1px var(--yt-border);
    opacity: 0;
    transition: opacity 0.12s;
  }
  li:hover .action,
  li:focus-within .action,
  .action.confirming {
    opacity: 1;
  }
  .action:hover {
    color: var(--yt-text);
    background: var(--yt-menu);
  }
  .action.delete.confirming {
    color: #fff;
    background: var(--yt-red);
    box-shadow: none;
    font-weight: 500;
  }
</style>
