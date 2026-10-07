import { mount, unmount } from "svelte";
import Panel from "../../components/Panel.svelte";
import { PageState } from "../../lib/page.svelte";
import { currentVideoId, panelAnchor, playerHeight, type Layout } from "../../lib/youtube";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  // Svelte + Crepe styles load into the panel's shadow root, not YouTube's page.
  cssInjectionMode: "ui",

  async main(ctx) {
    ctx.onInvalidated(shieldLinkEditor());
    const page = new PageState();

    const ui = await createShadowRootUi(ctx, {
      name: "notavid-panel",
      position: "inline",
      // Placed by `place()` below; this anchor is only the initial mount point.
      anchor: "body",
      // Keep keystrokes in the notes from reaching YouTube's shortcuts (k, j, l, f, /…).
      isolateEvents: true,
      onMount: (container) => mount(Panel, { target: container, props: { page } }),
      onRemove: (app) => app && unmount(app),
    });
    ui.shadowHost.style.display = "none";
    ui.mount();

    let layout: Layout = "default";

    /** Move the panel to the right spot for the current layout, and show it only on watch pages. */
    function place() {
      page.videoId = currentVideoId();
      page.dark = document.documentElement.hasAttribute("dark");
      const anchor = page.videoId ? panelAnchor() : null;
      if (!anchor) {
        ui.shadowHost.style.display = "none";
        return;
      }
      layout = anchor.layout;
      page.layout = layout;
      if (ui.shadowHost.parentElement !== anchor.el) anchor.el.prepend(ui.shadowHost);
      ui.shadowHost.style.display = "block";
      resize();
    }

    function resize() {
      // Beside the video: match the player's height, like YouTube's own
      // transcript/chat panels. Below it: a comfortable fixed share of the window.
      page.height =
        layout === "default"
          ? Math.max(360, Math.round(playerHeight()))
          : Math.round(Math.min(window.innerHeight * 0.7, 640));
    }

    // YouTube is a single-page app: re-place on its navigation events, and
    // when the watch page flips between one/two columns or theater mode.
    ctx.addEventListener(document, "yt-navigate-finish", place);
    ctx.addEventListener(document, "yt-page-data-updated", place);
    ctx.addEventListener(window, "resize", resize);

    const attrs = new MutationObserver(place);
    attrs.observe(document.documentElement, { attributes: true, attributeFilter: ["dark"] });
    const resizeObserver = new ResizeObserver(resize);

    // ytd-watch-flexy appears after the first watch-page navigation, so keep
    // looking until it exists, then watch its layout attributes.
    let watched: Element | null = null;
    const findFlexy = () => {
      const flexy = document.querySelector("ytd-watch-flexy");
      if (flexy && flexy !== watched) {
        watched = flexy;
        attrs.observe(flexy, { attributes: true, attributeFilter: ["is-two-columns_", "theater", "video-id"] });
      }
      const player = document.querySelector("#movie_player");
      if (player) resizeObserver.observe(player);
      place();
    };
    findFlexy();
    ctx.setInterval(() => {
      if (!watched || !watched.isConnected || ui.shadowHost.style.display === "none") findFlexy();
    }, 1000);

    ctx.onInvalidated(() => {
      attrs.disconnect();
      resizeObserver.disconnect();
    });
  },
});

/**
 * Milkdown's link editor closes on any document-level pointerdown outside
 * itself. From inside our shadow root, document sees every event retargeted
 * to the host, so a click on the link field or its ✓ (a pointerdown handler)
 * counts as "outside" and the editor closes before it can save. Hide clicks
 * inside the link editor from document pointerdown listeners. This patches
 * the content script's own isolated world only; YouTube's scripts never see
 * it. Returns the undo.
 */
function shieldLinkEditor(): () => void {
  const add = document.addEventListener;
  const remove = document.removeEventListener;
  const wrapped = new WeakMap<EventListener, EventListener>();
  const inLinkEditor = (e: Event) =>
    e.composedPath().some((el) => el instanceof Element && el.classList.contains("milkdown-link-edit"));

  document.addEventListener = function (this: Document, type: string, listener: any, options?: any) {
    if (type === "pointerdown" && typeof listener === "function") {
      let shielded = wrapped.get(listener);
      if (!shielded) {
        shielded = function (this: unknown, e: Event) {
          if (!inLinkEditor(e)) listener.call(this, e);
        };
        wrapped.set(listener, shielded);
      }
      return add.call(this, type, shielded, options);
    }
    return add.call(this, type, listener, options);
  } as typeof document.addEventListener;
  document.removeEventListener = function (this: Document, type: string, listener: any, options?: any) {
    return remove.call(this, type, (typeof listener === "function" && wrapped.get(listener)) || listener, options);
  } as typeof document.removeEventListener;

  return () => {
    document.addEventListener = add;
    document.removeEventListener = remove;
  };
}
