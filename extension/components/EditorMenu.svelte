<script lang="ts" module>
  export interface MenuItem {
    id: string;
    label: string;
    icon: string;
    shortcut?: string;
    active?: boolean;
    run: () => void;
  }
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";

  let {
    x,
    y,
    groups,
    hint,
    onclose,
  }: {
    x: number;
    y: number;
    groups: MenuItem[][];
    hint: string;
    onclose: () => void;
  } = $props();

  let menu: HTMLDivElement;
  let left = $state(0);
  let top = $state(0);

  onMount(() => {
    // Open at the pointer, flipped to stay inside the window.
    const { width, height } = menu.getBoundingClientRect();
    left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    top = y + height > window.innerHeight - 8 ? Math.max(8, y - height) : y;
    // Focus stays in the editor (moving it would drop the selection the menu
    // acts on), so Escape is caught where key events still arrive: the shadow
    // root, before WXT stops them from reaching YouTube.
    const root = menu.getRootNode() as Document | ShadowRoot;
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key === "Escape") {
        e.preventDefault();
        onclose();
      }
    };
    root.addEventListener("keydown", onKey, true);

    const close = () => onclose();
    // Pointer events from inside the shadow root reach window retargeted to
    // its host; the menu's own clicks are told apart by their path.
    const onPointer = (e: PointerEvent) => {
      if (!e.composedPath().includes(menu)) onclose();
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    // The user scrolling away closes it — but not scroll events in general:
    // ProseMirror scrolls the selection into view right as the menu opens.
    window.addEventListener("wheel", close, { capture: true, passive: true });
    return () => {
      root.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close, { capture: true });
    };
  });

  function pick(item: MenuItem) {
    onclose();
    item.run();
  }

</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="menu"
  role="menu"
  tabindex="-1"
  bind:this={menu}
  style:left="{left}px"
  style:top="{top}px"
  oncontextmenu={(e) => e.preventDefault()}
>
  {#each groups as group, g (g)}
    {#if g > 0}<hr />{/if}
    {#each group as item (item.id)}
      <!-- mousedown default would move focus out of the editor and drop its selection -->
      <button
        class="item"
        class:active={item.active}
        role="menuitem"
        data-action={item.id}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => pick(item)}
      >
        <Icon name={item.icon} size={18} />
        <span class="label">{item.label}</span>
        {#if item.shortcut}<kbd>{item.shortcut}</kbd>{/if}
      </button>
    {/each}
  {/each}
  <p class="hint">{hint}</p>
</div>

<style>
  .menu {
    position: fixed;
    z-index: 2147483000;
    min-width: 210px;
    padding: 6px 0;
    border-radius: 12px;
    background: var(--yt-menu);
    color: var(--yt-text);
    box-shadow: var(--yt-menu-shadow);
    outline: none;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: 34px;
    padding: 0 14px;
    border: none;
    background: none;
    font-size: 13.5px;
    text-align: start;
  }
  .item:hover,
  .item:focus-visible {
    background: var(--yt-chip);
    outline: none;
  }
  .item.active {
    color: var(--yt-blue);
  }
  .label {
    flex: 1;
  }
  kbd {
    font-family: inherit;
    font-size: 12px;
    color: var(--yt-text-secondary);
    direction: ltr;
  }
  hr {
    margin: 6px 0;
    border: none;
    border-top: 1px solid var(--yt-border);
  }
  .hint {
    margin: 4px 0 0;
    padding: 6px 14px 2px;
    border-top: 1px solid var(--yt-border);
    font-size: 11.5px;
    color: var(--yt-text-secondary);
  }
</style>
