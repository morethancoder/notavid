import type { Layout } from "./youtube";

/** What the content script knows about the YouTube page; the panel renders from it. */
export class PageState {
  videoId = $state<string | null>(null);
  dark = $state(false);
  layout = $state<Layout>("default");
  /** Panel height in px for the current layout. */
  height = $state(480);
}
