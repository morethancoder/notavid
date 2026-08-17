import { PlayerState, type VideoPlayer } from "./player";
import { settings } from "./settings.svelte";

/**
 * The core behavior of the app: typing pauses the video, and after a quiet
 * period the video resumes — but only if it was us who paused it. A video the
 * user paused manually stays paused.
 *
 * The enabled flag and resume delay live in the shared settings store so the
 * control bar and the settings dialog edit the same values.
 */
export class AutoPause {
  /** True while the video is paused because of typing. */
  holding = $state(false);
  /** ms epoch when playback will resume; drives the countdown UI. */
  resumeAt = $state<number | null>(null);

  #player: VideoPlayer | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;

  get enabled() {
    return settings.autoPause;
  }

  setPlayer(player: VideoPlayer | null) {
    this.#player = player;
    this.#clear();
  }

  /** Call on every keystroke / edit in the note. */
  activity() {
    if (!settings.autoPause || !this.#player) return;
    if (this.#player.isPlaying()) {
      this.#player.pause();
      this.holding = true;
    }
    if (this.holding) this.#scheduleResume();
  }

  /**
   * The user paused deliberately (e.g. the play/pause shortcut) — drop any
   * pending auto-resume so we don't restart a video they chose to stop.
   */
  cancel() {
    this.#clear();
  }

  /** Editor lost focus — resume soon rather than waiting the full delay. */
  blur() {
    if (this.holding) this.#scheduleResume(Math.min(settings.delaySeconds, 0.8));
  }

  /** Player state changed (from any source, including the user clicking the video). */
  onPlayerState(state: number) {
    // If the user manually resumes (or the video ends) while we're holding,
    // our hold is moot — drop it.
    if (state === PlayerState.PLAYING || state === PlayerState.ENDED) {
      this.#clear();
    }
  }

  toggleEnabled() {
    settings.autoPause = !settings.autoPause;
    settings.save();
    if (!settings.autoPause) this.#clear();
  }

  #scheduleResume(seconds = settings.delaySeconds) {
    if (this.#timer) clearTimeout(this.#timer);
    this.resumeAt = Date.now() + seconds * 1000;
    this.#timer = setTimeout(() => {
      const player = this.#player;
      this.#clear();
      player?.play();
    }, seconds * 1000);
  }

  #clear() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.holding = false;
    this.resumeAt = null;
  }
}
