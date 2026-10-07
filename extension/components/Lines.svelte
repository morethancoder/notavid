<script lang="ts">
  import Icon from "./Icon.svelte";
  import { t } from "../lib/settings.svelte";
  import { activeLine } from "../lib/lyrics";
  import { formatTime } from "../lib/youtube";

  /** Timed lines that follow the video: transcript segments or synced lyrics. */
  let {
    lines,
    time,
    offset = 0,
    follow = true,
    stamps = false,
    onseek,
    onaddline,
  }: {
    lines: { time: number; text: string; heading?: boolean }[];
    /** Current video time in seconds. */
    time: number;
    /** Seconds added to every line time (lyrics timing shift). */
    offset?: number;
    /** Keep the playing line in view. */
    follow?: boolean;
    /** Show each line's time. */
    stamps?: boolean;
    onseek: (seconds: number) => void;
    onaddline: (text: string, seconds: number) => void;
  } = $props();

  const current = $derived(activeLine(lines, time, offset));
  let added = $state<number | null>(null);

  function addLine(text: string, seconds: number, index: number) {
    onaddline(text, seconds);
    added = index;
    setTimeout(() => added === index && (added = null), 1200);
  }

  // ---- follow the current line, unless the reader is scrolling ------------
  let scroller = $state<HTMLDivElement | null>(null);
  let userScrollUntil = 0;
  const holdAutoScroll = () => (userScrollUntil = Date.now() + 4000);

  $effect(() => {
    const i = current;
    if (!follow || !scroller || i < 0 || Date.now() < userScrollUntil) return;
    const el = scroller.querySelector<HTMLElement>(`[data-line="${i}"]`);
    // Not scrollIntoView: that would scroll YouTube's page too.
    if (el) scroller.scrollTo({ top: el.offsetTop - scroller.clientHeight / 2 + el.offsetHeight / 2, behavior: "smooth" });
  });
</script>

<div class="scroller" role="list" bind:this={scroller} onwheel={holdAutoScroll} ontouchmove={holdAutoScroll}>
  {#each lines as line, i (i)}
    {@const at = Math.max(0, line.time + offset)}
    {#if line.heading}
      <h4 class="heading" dir="auto" role="listitem" data-line={i}>{line.text}</h4>
    {:else}
      <div class="line" role="listitem" class:active={i === current} class:past={i < current} data-line={i}>
        <button class="line-text" dir="auto" onclick={() => onseek(at)}>
          {#if stamps}<span class="stamp time">{formatTime(at)}</span>{/if}
          <span>{line.text || "♪"}</span>
        </button>
        {#if line.text}
          <button
            class="add"
            class:done={added === i}
            title={t("lyricsAddToNote")}
            aria-label={t("lyricsAddToNote")}
            onclick={() => addLine(line.text, at, i)}
          >
            <Icon name={added === i ? "check" : "noteAdd"} size={16} />
          </button>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .scroller {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px 8px 40%;
  }
  .heading {
    margin: 14px 10px 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--yt-text);
  }
  .line {
    display: flex;
    align-items: center;
    border-radius: 10px;
  }
  .line:hover {
    background: var(--yt-chip);
  }
  .line-text {
    display: flex;
    gap: 10px;
    flex: 1;
    padding: 6px 10px;
    border: none;
    background: none;
    text-align: start;
    font-size: 15px;
    line-height: 1.45;
    color: var(--yt-text-secondary);
    transition: color 0.2s;
  }
  .stamp {
    flex: none;
    min-width: 34px;
    padding-top: 1px;
    font-size: 12px;
    color: var(--yt-blue);
  }
  .line.past .line-text {
    opacity: 0.75;
  }
  .line.active .line-text {
    color: var(--yt-text);
    font-weight: 500;
    opacity: 1;
  }
  .add {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    margin-inline-end: 4px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--yt-text-secondary);
    opacity: 0;
  }
  .line:hover .add,
  .add:focus-visible,
  .add.done {
    opacity: 1;
  }
  .add:hover {
    background: var(--yt-chip-hover);
    color: var(--yt-text);
  }
  .add.done {
    color: var(--yt-green);
  }
</style>
