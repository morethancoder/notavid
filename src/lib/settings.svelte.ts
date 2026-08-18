import { browser } from "$app/environment";

export type ThemeSetting = "system" | "light" | "dark";
export type LanguageSetting = "system" | "en" | "ar";

const KEY = "notavid:settings";

interface Persisted {
  theme: ThemeSetting;
  language: LanguageSetting;
  autoPause: boolean;
  delaySeconds: number;
  /** Whitespace-only edits (spaces, blank lines, deleting them) don't pause. */
  ignoreWhitespace: boolean;
  /** Pause the video when the app window loses focus. */
  pauseOnBlur: boolean;
  /** Custom video player height in px; null = automatic default size. */
  playerHeight: number | null;
  /** Custom video player width in px (side-by-side layout); null = default. */
  playerWidth: number | null;
  /** Desktop layout: video beside the notes instead of above them. */
  sideBySide: boolean;
  /** Swap the panes: notes above/before the video instead of after it. */
  swapPanes: boolean;
  /** Note column width in px (line length); null = default. */
  editorWidth: number | null;
  /** Custom sidebar width in px (desktop); null = default. */
  sidebarWidth: number | null;
  /** Sidebar hidden on desktop. */
  sidebarCollapsed: boolean;
}

const defaults: Persisted = {
  theme: "system",
  language: "system",
  autoPause: true,
  delaySeconds: 3,
  ignoreWhitespace: true,
  pauseOnBlur: true,
  playerHeight: null,
  playerWidth: null,
  sideBySide: false,
  swapPanes: false,
  editorWidth: null,
  sidebarWidth: null,
  sidebarCollapsed: false,
};

function load(): Persisted {
  if (!browser) return defaults;
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

/**
 * App settings. "system" values follow the OS preference live
 * (prefers-color-scheme / navigator.language).
 */
class Settings {
  theme = $state<ThemeSetting>(defaults.theme);
  language = $state<LanguageSetting>(defaults.language);
  autoPause = $state(defaults.autoPause);
  delaySeconds = $state(defaults.delaySeconds);
  ignoreWhitespace = $state(defaults.ignoreWhitespace);
  pauseOnBlur = $state(defaults.pauseOnBlur);
  playerHeight = $state<number | null>(defaults.playerHeight);
  playerWidth = $state<number | null>(defaults.playerWidth);
  sideBySide = $state(defaults.sideBySide);
  swapPanes = $state(defaults.swapPanes);
  editorWidth = $state<number | null>(defaults.editorWidth);
  sidebarWidth = $state<number | null>(defaults.sidebarWidth);
  sidebarCollapsed = $state(defaults.sidebarCollapsed);

  #systemDark = $state(false);
  #systemArabic = $state(false);

  readonly resolvedTheme = $derived<"light" | "dark">(
    this.theme === "system" ? (this.#systemDark ? "dark" : "light") : this.theme,
  );
  readonly locale = $derived<"en" | "ar">(
    this.language === "system" ? (this.#systemArabic ? "ar" : "en") : this.language,
  );
  readonly dir = $derived<"ltr" | "rtl">(this.locale === "ar" ? "rtl" : "ltr");

  constructor() {
    if (!browser) return;
    Object.assign(this, load());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    this.#systemDark = mq.matches;
    mq.addEventListener("change", (e) => (this.#systemDark = e.matches));
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    this.#systemArabic = langs.some((l) => l?.toLowerCase().startsWith("ar"));
  }

  save() {
    if (!browser) return;
    const data: Persisted = {
      theme: this.theme,
      language: this.language,
      autoPause: this.autoPause,
      delaySeconds: this.delaySeconds,
      ignoreWhitespace: this.ignoreWhitespace,
      pauseOnBlur: this.pauseOnBlur,
      playerHeight: this.playerHeight,
      playerWidth: this.playerWidth,
      sideBySide: this.sideBySide,
      swapPanes: this.swapPanes,
      editorWidth: this.editorWidth,
      sidebarWidth: this.sidebarWidth,
      sidebarCollapsed: this.sidebarCollapsed,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  }
}

export const settings = new Settings();
