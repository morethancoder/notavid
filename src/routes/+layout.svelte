<script lang="ts">
  import "@fontsource/roboto/400.css";
  import "@fontsource/roboto/500.css";
  import "@fontsource/roboto/700.css";
  import "../app.css";
  import { settings } from "$lib/settings.svelte";

  let { children } = $props();

  // Android runs edge-to-edge, so the WebView sits under the system bars.
  // MainActivity exposes the bar heights (in CSS px) via this bridge; env()
  // in app.css is the fallback where the bridge doesn't exist.
  $effect(() => {
    const insets = (window as { NotavidInsets?: { top(): number; bottom(): number } })
      .NotavidInsets;
    if (!insets) return;
    const style = document.documentElement.style;
    style.setProperty("--safe-top", `${insets.top()}px`);
    style.setProperty("--safe-bottom", `${insets.bottom()}px`);
  });

  // Reflect resolved theme/locale onto <html> so CSS tokens and direction
  // follow the settings (including live OS preference changes).
  $effect(() => {
    const el = document.documentElement;
    el.dataset.theme = settings.resolvedTheme;
    el.lang = settings.locale;
    el.dir = settings.dir;
  });
</script>

{@render children()}
