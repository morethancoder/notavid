import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineWebExtConfig } from "wxt";

// `make extdev` browser. Without a binary, web-ext launches whichever Chrome
// it finds first — Chrome Canary on this machine — so prefer stable Chrome.
const stableChrome = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/usr/bin/google-chrome",
}[process.platform as string];

// A dev-only profile that survives restarts: a YouTube sign-in and test notes
// stick. Chrome needs the folder to exist before launch.
const profile = resolve(".chrome-dev");
mkdirSync(profile, { recursive: true });

export default defineWebExtConfig({
  binaries: stableChrome && existsSync(stableChrome) ? { chrome: stableChrome } : {},
  chromiumProfile: profile,
  keepProfileChanges: true,
  startUrls: ["https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
});
