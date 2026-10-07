<script lang="ts">
  import Icon from "./Icon.svelte";
  import { settings, t } from "../lib/settings.svelte";
  import type { LanguageSetting } from "../lib/i18n";

  const langOptions: { value: LanguageSetting; label: () => string }[] = [
    { value: "system", label: () => t("langSystem") },
    { value: "en", label: () => t("langEnglish") },
    { value: "ar", label: () => t("langArabic") },
  ];
  const delayOptions = [1, 2, 3, 5, 10];

  function set<K extends "autoPause" | "ignoreWhitespace" | "delaySeconds" | "language">(
    key: K,
    value: (typeof settings)[K],
  ) {
    settings[key] = value;
    settings.save();
  }
</script>

<div class="settings">
  <section>
    <h3><Icon name="pause" size={18} />{t("playback")}</h3>
    <div class="row">
      <span>{t("toggleAutoPause")}</span>
      <button
        class="toggle"
        class:on={settings.autoPause}
        role="switch"
        aria-checked={settings.autoPause}
        aria-label={t("toggleAutoPause")}
        onclick={() => set("autoPause", !settings.autoPause)}
      >
        <span class="knob"></span>
      </button>
    </div>
    <div class="row">
      <span>{t("ignoreWhitespace")}</span>
      <button
        class="toggle"
        class:on={settings.ignoreWhitespace}
        role="switch"
        aria-checked={settings.ignoreWhitespace}
        aria-label={t("ignoreWhitespace")}
        onclick={() => set("ignoreWhitespace", !settings.ignoreWhitespace)}
      >
        <span class="knob"></span>
      </button>
    </div>
    <span class="label">{t("resumeDelay")}</span>
    <div class="chips" role="radiogroup" aria-label={t("resumeDelay")}>
      {#each delayOptions as d (d)}
        <button
          class="chip"
          class:selected={settings.delaySeconds === d}
          role="radio"
          aria-checked={settings.delaySeconds === d}
          onclick={() => set("delaySeconds", d)}
        >
          {t("seconds", { n: d })}
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h3><Icon name="language" size={18} />{t("language")}</h3>
    <div class="chips" role="radiogroup" aria-label={t("language")}>
      {#each langOptions as opt (opt.value)}
        <button
          class="chip lang"
          class:selected={settings.language === opt.value}
          role="radio"
          aria-checked={settings.language === opt.value}
          data-lang={opt.value}
          onclick={() => set("language", opt.value)}
        >
          {#if settings.language === opt.value}<Icon name="check" size={15} />{/if}
          {opt.label()}
        </button>
      {/each}
    </div>
  </section>
</div>

<style>
  section {
    padding: 12px 16px 14px;
  }
  section + section {
    border-top: 1px solid var(--yt-border);
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 500;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    font-size: 13.5px;
  }
  .label {
    display: block;
    margin: 8px 0 6px;
    font-size: 12.5px;
    color: var(--yt-text-secondary);
  }
  .chip {
    font-weight: 400;
  }
</style>
