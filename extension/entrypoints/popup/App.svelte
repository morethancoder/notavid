<script lang="ts">
  import History from "../../components/History.svelte";
  import Icon from "../../components/Icon.svelte";
  import Settings from "../../components/Settings.svelte";
  import { settings, t } from "../../lib/settings.svelte";
  import "../../styles/notavid.css";

  // The popup isn't on YouTube, so it follows the browser's light/dark setting.
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  let dark = $state(scheme.matches);
  scheme.addEventListener("change", (e) => (dark = e.matches));

  let showSettings = $state(false);

  $effect(() => {
    document.documentElement.lang = settings.locale;
    document.documentElement.dir = settings.dir;
    document.body.style.background = dark ? "#0f0f0f" : "#fff";
  });

  function toggleAuto() {
    settings.autoPause = !settings.autoPause;
    settings.save();
  }
</script>

<main class="nv" data-theme={dark ? "dark" : "light"} dir={settings.dir} lang={settings.locale}>
  <header>
    <span class="brand-mark"><Icon name="play" size={16} /></span>
    <h1 class="wordmark">{t("appName")}</h1>
    <button
      class="toggle"
      class:on={settings.autoPause}
      role="switch"
      aria-checked={settings.autoPause}
      aria-label={t("toggleAutoPause")}
      title={t("toggleAutoPause")}
      onclick={toggleAuto}
    >
      <span class="knob"></span>
    </button>
    <button class="icon-btn" title={t("settings")} aria-label={t("settings")} aria-expanded={showSettings} onclick={() => (showSettings = !showSettings)}>
      <Icon name={showSettings ? "close" : "settings"} size={20} />
    </button>
  </header>
  <p class="status">
    <span class="dot" class:off={!settings.autoPause}></span>
    {settings.autoPause ? t("autoPauseOn") : t("autoPauseOff")}
  </p>
  {#if showSettings}
    <div class="settings"><Settings /></div>
  {:else}
    <div class="list">
      <History linkTarget="_blank" />
    </div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
  }
  main {
    width: 380px;
    min-height: 260px;
    max-height: 590px;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 8px 4px 16px;
  }
  main[dir="rtl"] header {
    padding: 12px 16px 4px 8px;
  }
  h1 {
    flex: 1;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 2px 16px 10px;
    border-bottom: 1px solid var(--yt-border);
    font-size: 12.5px;
    color: var(--yt-text-secondary);
  }
  .list,
  .settings {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
