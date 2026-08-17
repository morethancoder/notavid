<script lang="ts">
  import { settings, type ThemeSetting, type LanguageSetting } from "$lib/settings.svelte";
  import { t } from "$lib/i18n.svelte";
  import Icon from "./Icon.svelte";

  let { onclose }: { onclose: () => void } = $props();

  const themeOptions: { value: ThemeSetting; label: () => string }[] = [
    { value: "system", label: () => t("themeSystem") },
    { value: "light", label: () => t("themeLight") },
    { value: "dark", label: () => t("themeDark") },
  ];
  const langOptions: { value: LanguageSetting; label: () => string }[] = [
    { value: "system", label: () => t("langSystem") },
    { value: "en", label: () => t("langEnglish") },
    { value: "ar", label: () => t("langArabic") },
  ];
  const delayOptions = [1, 2, 3, 5, 10];

  function setTheme(value: ThemeSetting) {
    settings.theme = value;
    settings.save();
  }
  function setLanguage(value: LanguageSetting) {
    settings.language = value;
    settings.save();
  }
  function setDelay(value: number) {
    settings.delaySeconds = value;
    settings.save();
  }
  function toggleAutoPause() {
    settings.autoPause = !settings.autoPause;
    settings.save();
  }

  function handleScrimKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label={t("settings")}
    tabindex="-1"
    onkeydown={handleScrimKeydown}
  >
    <header>
      <h2>{t("settings")}</h2>
      <button class="icon-btn" onclick={onclose} aria-label={t("close")}>
        <Icon name="close" size={20} />
      </button>
    </header>

    <section>
      <h3><Icon name="darkMode" size={18} />{t("appearance")}</h3>
      <div class="field">
        <span class="field-label">{t("theme")}</span>
        <div class="chips">
          {#each themeOptions as opt (opt.value)}
            <button
              class="chip"
              class:selected={settings.theme === opt.value}
              onclick={() => setTheme(opt.value)}
            >
              {#if settings.theme === opt.value}<Icon name="check" size={15} />{/if}
              {opt.label()}
            </button>
          {/each}
        </div>
      </div>
    </section>

    <section>
      <h3><Icon name="language" size={18} />{t("language")}</h3>
      <div class="field">
        <div class="chips">
          {#each langOptions as opt (opt.value)}
            <button
              class="chip"
              class:selected={settings.language === opt.value}
              onclick={() => setLanguage(opt.value)}
            >
              {#if settings.language === opt.value}<Icon name="check" size={15} />{/if}
              {opt.label()}
            </button>
          {/each}
        </div>
      </div>
    </section>

    <section>
      <h3><Icon name="pause" size={18} />{t("playback")}</h3>
      <div class="field row-field">
        <span class="field-label">{t("autoPauseDefault")}</span>
        <button
          class="toggle"
          class:on={settings.autoPause}
          role="switch"
          aria-checked={settings.autoPause}
          aria-label={t("autoPauseDefault")}
          onclick={toggleAutoPause}
        >
          <span class="knob"></span>
        </button>
      </div>
      <div class="field">
        <span class="field-label">{t("resumeDelay")}</span>
        <div class="chips">
          {#each delayOptions as d (d)}
            <button
              class="chip"
              class:selected={settings.delaySeconds === d}
              onclick={() => setDelay(d)}
            >
              {t("seconds", { n: d })}
            </button>
          {/each}
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--yt-scrim);
    display: grid;
    place-items: center;
    z-index: 50;
  }
  .dialog {
    width: min(440px, calc(100vw - 2rem));
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    background: var(--yt-menu);
    color: var(--yt-text);
    border-radius: 16px;
    box-shadow: var(--yt-shadow);
    padding: 0.5rem 0 1rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem 0.5rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 500;
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--yt-text);
    cursor: pointer;
  }
  .icon-btn:hover {
    background: var(--yt-chip);
  }
  section {
    padding: 0.6rem 1.25rem 0.2rem;
  }
  section + section {
    border-top: 1px solid var(--yt-border);
    margin-top: 0.6rem;
    padding-top: 0.9rem;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--yt-text);
  }
  .field {
    margin-bottom: 0.85rem;
  }
  .field-label {
    display: block;
    font-size: 0.8rem;
    color: var(--yt-text-secondary);
    margin-bottom: 0.45rem;
  }
  .row-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .row-field .field-label {
    margin-bottom: 0;
    color: var(--yt-text);
    font-size: 0.85rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.8rem;
    border: none;
    border-radius: 8px;
    background: var(--yt-chip);
    color: var(--yt-text);
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip:hover {
    background: var(--yt-chip-hover);
  }
  .chip.selected {
    background: var(--yt-text);
    color: var(--yt-base);
  }
  .toggle {
    position: relative;
    width: 38px;
    height: 21px;
    border-radius: 12px;
    border: none;
    background: var(--yt-chip-hover);
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .toggle.on {
    background: var(--yt-red);
  }
  .knob {
    position: absolute;
    top: 3px;
    inset-inline-start: 3px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }
  .toggle.on .knob {
    transform: translateX(17px);
  }
  :global([dir="rtl"]) .toggle.on .knob {
    transform: translateX(-17px);
  }
</style>
