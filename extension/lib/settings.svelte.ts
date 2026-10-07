import { browser } from "wxt/browser";
import { resolveLocale, translate, type LanguageSetting, type MessageKey } from "./i18n";

const KEY = "settings";

interface Persisted {
  /** Pause while typing, resume after a quiet delay. */
  autoPause: boolean;
  delaySeconds: number;
  /** Whitespace-only edits (spaces, blank lines, deleting them) don't pause. */
  ignoreWhitespace: boolean;
  /** Panel folded down to its header. */
  collapsed: boolean;
  /** UI language: the browser's, or a fixed one. */
  language: LanguageSetting;
}

const defaults: Persisted = {
  autoPause: true,
  delaySeconds: 3,
  ignoreWhitespace: true,
  collapsed: false,
  language: "system",
};

/** Settings shared by every YouTube tab and the popup (chrome.storage.local). */
class Settings {
  autoPause = $state(defaults.autoPause);
  delaySeconds = $state(defaults.delaySeconds);
  ignoreWhitespace = $state(defaults.ignoreWhitespace);
  collapsed = $state(defaults.collapsed);
  language = $state<LanguageSetting>(defaults.language);

  readonly locale = $derived(resolveLocale(this.language));
  readonly dir = $derived<"ltr" | "rtl">(this.locale === "ar" ? "rtl" : "ltr");

  constructor() {
    browser.storage.local.get(KEY).then((items) => this.#apply(items[KEY] as Partial<Persisted>));
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[KEY]) this.#apply(changes[KEY].newValue as Partial<Persisted>);
    });
  }

  #apply(stored: Partial<Persisted> | undefined) {
    Object.assign(this, { ...defaults, ...stored });
  }

  save() {
    const data: Persisted = {
      autoPause: this.autoPause,
      delaySeconds: this.delaySeconds,
      ignoreWhitespace: this.ignoreWhitespace,
      collapsed: this.collapsed,
      language: this.language,
    };
    browser.storage.local.set({ [KEY]: data });
  }
}

export const settings = new Settings();

/** Translate into the current UI language. */
export const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(settings.locale, key, vars);
