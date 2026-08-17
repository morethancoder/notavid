<script lang="ts">
  import "@fontsource/roboto/400.css";
  import "@fontsource/roboto/500.css";
  import "@fontsource/roboto/700.css";
  import "../app.css";
  import { settings } from "$lib/settings.svelte";

  let { children } = $props();

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
