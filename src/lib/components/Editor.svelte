<script lang="ts">
  import { onMount } from "svelte";
  import { Crepe } from "@milkdown/crepe";
  import { insert } from "@milkdown/kit/utils";
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
    instance.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        onchange?.(markdown);
        onactivity?.();
      });
      listener.blur(() => oneditorblur?.());
    });
    instance.create().then(() => {
      crepe = instance;
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || nonTypingKeys.has(e.key)) return;
    onactivity?.();
  }

  function handleClick(e: MouseEvent) {
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
      padding: 20px 10px 48px;
    }
  }
</style>
