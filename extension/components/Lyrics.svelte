<script lang="ts">
  import Icon from "./Icon.svelte";
  import Lines from "./Lines.svelte";
  import { t } from "../lib/settings.svelte";
  import { lookupLyrics, rememberLyrics, searchLyrics, type Lyrics, type SavedLyrics } from "../lib/lyrics";
  import { formatTime } from "../lib/youtube";

  let {
    videoId,
    time,
    onseek,
    onaddline,
  }: {
    videoId: string;
    /** Current video time in seconds. */
    time: number;
    onseek: (seconds: number) => void;
    onaddline: (text: string, seconds: number) => void;
  } = $props();

  type Status = "loading" | "found" | "notfound" | "error" | "search";

  let status = $state<Status>("loading");
  let saved = $state<SavedLyrics | null>(null);
  let query = $state("");
  let results = $state<Lyrics[] | null>(null);
  let searching = $state(false);

  const lines = $derived(saved?.lyrics.synced ?? null);
  const offset = $derived(saved?.offset ?? 0);
  const offsetLabel = $derived(`${offset > 0 ? "+" : ""}${offset.toFixed(1)}s`);

  $effect(() => {
    const id = videoId;
    let cancelled = false;
    status = "loading";
    saved = null;
    results = null;
    lookupLyrics(id).then((r) => {
      if (cancelled) return;
      query = r.query;
      saved = r.saved;
      status = r.saved ? "found" : r.error ? "error" : "notfound";
    });
    return () => (cancelled = true);
  });

  async function runSearch(e?: Event) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    searching = true;
    try {
      results = await searchLyrics(q);
    } catch {
      results = [];
      status = "error";
    } finally {
      searching = false;
    }
  }

  function choose(lyrics: Lyrics) {
    saved = { lyrics, offset: 0 };
    status = "found";
    results = null;
    rememberLyrics(videoId, saved, query);
  }

  function shift(delta: number) {
    if (!saved) return;
    saved = { ...saved, offset: Math.round((saved.offset + delta) * 10) / 10 };
    rememberLyrics(videoId, saved, query);
  }

  function openSearch() {
    status = "search";
    results = null;
  }
</script>

<div class="lyrics">
  {#if status === "loading"}
    <p class="message"><span class="spinner"></span>{t("lyricsLoading")}</p>
  {:else if status === "found" && saved}
    <div class="song">
      <Icon name="music" size={18} />
      <div class="song-meta">
        <span class="track" dir="auto">{saved.lyrics.track}</span>
        <span class="artist" dir="auto">{saved.lyrics.artist}</span>
      </div>
      <button class="icon-btn" title={t("lyricsWrongSong")} aria-label={t("lyricsWrongSong")} onclick={openSearch}>
        <Icon name="search" size={18} />
      </button>
    </div>

    {#if saved.lyrics.instrumental}
      <p class="message">{t("lyricsInstrumental")}</p>
    {:else if lines}
      <Lines {lines} {time} {offset} {onseek} {onaddline} />
    {:else}
      <div class="plain" dir="auto">{saved.lyrics.plain}</div>
    {/if}

    <footer class="tab-footer">
      {#if lines}
        <span class="badge synced">{t("lyricsSynced")}</span>
        <span class="offset" role="group" aria-label={t("lyricsOffset")} title={t("lyricsOffset")}>
          <button class="pill square" aria-label={t("lyricsEarlier")} title={t("lyricsEarlier")} onclick={() => shift(-0.5)}>
            <Icon name="remove" size={16} />
          </button>
          <span class="time">{offsetLabel}</span>
          <button class="pill square" aria-label={t("lyricsLater")} title={t("lyricsLater")} onclick={() => shift(0.5)}>
            <Icon name="add" size={16} />
          </button>
        </span>
      {:else if !saved.lyrics.instrumental}
        <span class="badge">{t("lyricsPlain")}</span>
      {/if}
      <span class="spacer"></span>
      <a class="source" href="https://lrclib.net" target="_blank" rel="noopener">{t("lyricsSource")}</a>
    </footer>
  {:else}
    {#if status === "notfound"}
      <p class="message">{t("lyricsNotFound")}</p>
    {:else if status === "error"}
      <p class="message">{t("lyricsError")}</p>
    {/if}
    <form class="search" onsubmit={runSearch}>
      <label class="field-input">
        <Icon name="search" size={18} />
        <input type="search" placeholder={t("lyricsSearch")} bind:value={query} dir="auto" />
      </label>
      <button class="chip selected" type="submit" disabled={searching}>{t("lyricsSearchAction")}</button>
    </form>
    {#if searching}
      <p class="message"><span class="spinner"></span></p>
    {:else if results}
      {#if results.length === 0}
        <p class="message">{t("lyricsNoResults")}</p>
      {:else}
        <ul class="results">
          {#each results as r (r.id)}
            <li>
              <button onclick={() => choose(r)}>
                <span class="track" dir="auto">{r.track}</span>
                <span class="artist" dir="auto">
                  {r.artist} · <span class="time">{formatTime(r.duration)}</span>
                  {#if r.synced} · {t("lyricsSynced")}{/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .lyrics {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .song {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 6px 16px;
    color: var(--yt-text-secondary);
  }
  :global([dir="rtl"]) .song {
    padding: 6px 16px 6px 8px;
  }
  .song-meta,
  .results button {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .track {
    color: var(--yt-text);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .artist {
    font-size: 12px;
    color: var(--yt-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .plain {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px 20px 40px;
    white-space: pre-wrap;
    font-size: 15px;
    line-height: 1.6;
  }
  .offset {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .offset .time {
    min-width: 40px;
    text-align: center;
  }
  .search {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
  }
  .search .field-input {
    flex: 1;
  }
  .search .chip {
    height: 36px;
    border-radius: 18px;
  }
  .results {
    list-style: none;
    margin: 0;
    padding: 0 8px 8px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  .results button {
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 10px;
    background: none;
    text-align: start;
  }
  .results button:hover {
    background: var(--yt-chip);
  }
</style>
