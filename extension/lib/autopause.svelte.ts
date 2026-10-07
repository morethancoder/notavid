import { settings } from "./settings.svelte";
import { mainVideo } from "./youtube";

/**
 * Typing pauses YouTube's video, and after a quiet period it resumes — but
 * only if we paused it. A video the user paused themselves stays paused.
 */
export class AutoPause {
  /** True while the video is paused because of typing. */
  holding = $state(false);
  /** ms epoch when playback resumes; drives the countdown UI. */
  resumeAt = $state<number | null>(null);

  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Media events don't bubble, but a capturing listener on the document
    // still sees them — and survives YouTube swapping the <video> element.
    document.addEventListener("play", this.#onPlay, true);
  }

  destroy() {
    document.removeEventListener("play", this.#onPlay, true);
    this.#clear();
  }

  /** Call on every keystroke / edit in the note. */
  activity() {
    if (!settings.autoPause) return;
    const video = mainVideo();
    if (!video) return;
    if (!video.paused && !video.ended) {
      video.pause();
      this.holding = true;
    }
    if (this.holding) this.#scheduleResume();
  }

  /** Editor lost focus — resume soon rather than waiting the full delay. */
  blur() {
    if (this.holding) this.#scheduleResume(Math.min(settings.delaySeconds, 0.8));
  }

  /** Drop any pending resume (auto-pause switched off, video changed). */
  cancel() {
    this.#clear();
  }

  // The user resumed the video themselves while we were holding — the hold is moot.
  #onPlay = (e: Event) => {
    if (this.holding && e.target === mainVideo()) this.#clear();
  };

  #scheduleResume(seconds = settings.delaySeconds) {
    if (this.#timer) clearTimeout(this.#timer);
    this.resumeAt = Date.now() + seconds * 1000;
    this.#timer = setTimeout(() => {
      this.#clear();
      mainVideo()?.play().catch(() => {});
    }, seconds * 1000);
  }

  #clear() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.holding = false;
    this.resumeAt = null;
  }
}
