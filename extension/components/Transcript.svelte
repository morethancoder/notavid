<script lang="ts">
  import Icon from "./Icon.svelte";
  import Lines from "./Lines.svelte";
  import Lyrics from "./Lyrics.svelte";
  import { t } from "../lib/settings.svelte";
  import { lookupLyrics } from "../lib/lyrics";
  import { loadSavedTranscript, readTranscript, saveTranscript, type Transcript } from "../lib/transcript";

  /**
   * The Transcript tab: the video's own transcript from YouTube, or song
   * lyrics from LRCLIB. It opens on the transcript when the video has a
   * written one, and on lyrics when a song matched and the only transcript is
   * YouTube's auto-generated one (which garbles singing).
   */
  let {
    videoId,
    time,
    onseek,
    onaddline,
  }: {
    videoId: string;
    time: number;
    onseek: (seconds: number) => void;
    onaddline: (text: string, seconds: number) => void;
  } = $props();

  type Mode = "transcript" | "lyrics";
  type Status = "loading" | "found" | "none" | "error";

  // The view the user picked per video, kept while the page is open.
  const picked = ((globalThis as { __nvTranscriptMode?: Map<string, Mode> }).__nvTranscriptMode ??= new Map());

  let mode = $state<Mode | null>(null);
  let status = $state<Status>("loading");
  let transcript = $state<Transcript | null>(null);
  let filter = $state("");

  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!transcript) return [];
    return q ? transcript.lines.filter((l) => !l.heading && l.text.toLowerCase().includes(q)) : transcript.lines;
  });

  $effect(() => {
    const id = videoId;
    let cancelled = false;
    mode = picked.get(id) ?? null;
    status = "loading";
    transcript = null;
    filter = "";
    load(id, () => cancelled);
    return () => (cancelled = true);
  });

  async function load(id: string, cancelled: () => boolean) {
    let found = await loadSavedTranscript(id);
    if (!found) {
      try {
        found = await readTranscript(id);
        if (found?.lines.length) saveTranscript(id, found);
        else found = null;
      } catch {
        if (cancelled()) return;
        status = "error";
      }
    }
    if (cancelled()) return;
    if (found) {
      transcript = found;
      status = "found";
    } else if (status !== "error") status = "none";
    if (mode) return;
    if (found && !found.auto) {
      mode = "transcript";
      return;
    }
    const lyrics = await lookupLyrics(id);
    if (cancelled() || mode) return;
    mode = lyrics.saved || !found ? "lyrics" : "transcript";
  }

  function pick(next: Mode) {
    mode = next;
    picked.set(videoId, next);
  }

  function retry() {
    status = "loading";
    load(videoId, () => false);
  }
</script>

<div class="transcript">
  <div class="modes" role="tablist">
    <button class="chip" role="tab" data-mode="transcript" aria-selected={mode === "transcript"} onclick={() => pick("transcript")}>
      {t("transcript")}
    </button>
    <button class="chip" role="tab" data-mode="lyrics" aria-selected={mode === "lyrics"} onclick={() => pick("lyrics")}>
      <Icon name="music" size={15} />{t("lyrics")}
    </button>
    {#if mode === "transcript" && status === "found"}
      <label class="field-input filter">
        <Icon name="search" size={16} />
        <input type="search" placeholder={t("transcriptFilter")} bind:value={filter} dir="auto" />
      </label>
    {/if}
  </div>

  {#if mode === "lyrics"}
    <Lyrics {videoId} {time} {onseek} {onaddline} />
  {:else if mode === null || status === "loading"}
    <p class="message"><span class="spinner"></span>{t("transcriptLoading")}</p>
  {:else if status === "found" && transcript}
    {#if shown.length}
      <Lines lines={shown} {time} stamps follow={!filter.trim()} {onseek} {onaddline} />
    {:else}
      <p class="message">{t("noMatches")}</p>
    {/if}
    <footer class="tab-footer">
      {#if transcript.auto}<span class="badge">{t("transcriptAuto")}</span>{/if}
      <span>{t("lines", { n: transcript.lines.filter((l) => !l.heading).length })}</span>
      <span class="spacer"></span>
      <span>{t("transcriptSource")}</span>
    </footer>
  {:else if status === "none"}
    <p class="message">{t("transcriptNone")}</p>
  {:else}
    <p class="message">{t("transcriptError")}</p>
    <p class="retry"><button class="chip" onclick={retry}><Icon name="refresh" size={16} />{t("retry")}</button></p>
  {/if}
</div>

<style>
  .transcript {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .modes {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px 4px;
  }
  .modes .chip {
    height: 28px;
    padding: 0 10px;
    font-size: 12.5px;
  }
  .filter {
    flex: 1;
    min-width: 0;
    height: 30px;
    margin-inline-start: 4px;
  }
  .retry {
    display: flex;
    justify-content: center;
    margin: 0;
  }
</style>
