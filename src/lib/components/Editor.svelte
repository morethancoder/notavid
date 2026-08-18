<script lang="ts">
  import { onMount } from "svelte";
  import { Crepe } from "@milkdown/crepe";
  import { insert } from "@milkdown/kit/utils";
  import { timestampHighlighter, parseTimestamp } from "$lib/timestamps";
  import { settings } from "$lib/settings.svelte";
  import "@milkdown/crepe/theme/common/style.css";
  // Both theme palettes inlined; the active one is injected based on settings.
  import frameLight from "@milkdown/crepe/theme/frame.css?inline";
  import frameDark from "@milkdown/crepe/theme/frame-dark.css?inline";

  let {
    value = "",
    placeholder = "",
    onchange,
    onactivity,
    oneditorblur,
    ontimestampclick,
  }: {
    value?: string;
    placeholder?: string;
    onchange?: (markdown: string) => void;
    onactivity?: () => void;
    oneditorblur?: () => void;
    ontimestampclick?: (seconds: number) => void;
  } = $props();

  const themeCss = $derived(settings.resolvedTheme === "dark" ? frameDark : frameLight);

  let root: HTMLDivElement;
  let crepe: Crepe | null = null;
  const stripWs = (s: string) => s.replace(/\s+/g, "");
  // svelte-ignore state_referenced_locally -- the initial content is the diff baseline
  let lastStripped = stripWs(value);

  onMount(() => {
    const instance = new Crepe({
      root,
      defaultValue: value,
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: placeholder,
          mode: "block",
        },
      },
    });
    instance.editor.use(timestampHighlighter);
    instance.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        // A change that only adds/removes whitespace (spaces, blank lines,
        // backspacing them) is not "typing" when ignoreWhitespace is on.
        const stripped = stripWs(markdown);
        const whitespaceOnly = stripped === lastStripped;
        lastStripped = stripped;
        onchange?.(markdown);
        if (!(settings.ignoreWhitespace && whitespaceOnly)) onactivity?.();
      });
      listener.blur(() => oneditorblur?.());
    });
    instance.create().then(() => {
      crepe = instance;
      // Crepe normalizes the markdown it serializes (bullet style, escapes),
      // so re-baseline against its own form — otherwise the first
      // whitespace-only edit after mount can be misread as typing.
      lastStripped = stripWs(instance.getMarkdown());
    });
    return () => {
      crepe = null;
      instance.destroy();
    };
  });

  export function insertMarkdown(markdown: string) {
    crepe?.editor.action(insert(markdown, true));
  }

  // Keys that scroll or navigate the note without editing it — reading around
  // in the notes must not pause the video. Real edits are also caught by
  // markdownUpdated, so filtering here can't miss actual typing.
  const nonTypingKeys = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    "Shift",
    "Control",
    "Alt",
    "Meta",
    "CapsLock",
    "Escape",
  ]);

  // Keys whose effect may be whitespace-only; with ignoreWhitespace on they
  // defer to the content diff in markdownUpdated instead of pausing here.
  const whitespaceKeys = new Set([" ", "Enter", "Tab", "Backspace", "Delete"]);

  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || nonTypingKeys.has(e.key)) return;
    if (settings.ignoreWhitespace && whitespaceKeys.has(e.key)) return;
    onactivity?.();
  }

  function handleClick(e: MouseEvent) {
    const stamp = (e.target as HTMLElement).closest(".nv-timestamp");
    if (stamp) {
      const seconds = parseTimestamp(stamp.textContent ?? "");
      if (seconds != null) {
        ontimestampclick?.(seconds);
        return;
      }
    }
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor?.href) return;
    // Timestamp links ([m:ss](https://youtu.be/ID?t=N)) seek the player
    // instead of navigating.
    try {
      const url = new URL(anchor.href);
      const t = url.searchParams.get("t");
      if (t && /^\d+$/.test(t)) {
        e.preventDefault();
        e.stopPropagation();
        ontimestampclick?.(parseInt(t, 10));
        return;
      }
    } catch {
      // not a URL we care about
    }
    // Never let plain clicks navigate the app window away.
    e.preventDefault();
  }
</script>

<svelte:head>
  {@html `<style>${themeCss}</style>`}
</svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
  class="editor-root"
  dir="auto"
  bind:this={root}
  onkeydowncapture={handleKeydown}
  onclickcapture={handleClick}
></div>

<style>
  .editor-root {
    height: 100%;
  }
  .editor-root :global(.nv-timestamp) {
    color: var(--yt-blue);
    cursor: pointer;
  }
  .editor-root :global(.nv-timestamp:hover) {
    text-decoration: underline;
  }
  /* Bottom: room to scroll the last lines up into comfortable view without
     padding the note with blank lines (clicks in the space land at the end).
     Inline: Crepe ships 120px gutters that would eat most of a widened
     column — keep them slim and let the width setting do the spreading. */
  .editor-root :global(.milkdown .ProseMirror) {
    padding-bottom: 45vh;
    padding-inline: 24px;
  }
  .editor-root :global(.milkdown) {
    height: 100%;
    background: transparent;
    --crepe-color-background: transparent;
    --crepe-font-default:
      "Roboto", -apple-system, BlinkMacSystemFont, "SF Arabic", "Segoe UI",
      Arial, sans-serif;
  }
  /* Crepe ships a 120px horizontal gutter; on phones that leaves almost no
     room for text. */
  @media (max-width: 720px) {
    .editor-root :global(.milkdown .ProseMirror) {
      padding: 20px 10px 45vh;
    }
  }
</style>
