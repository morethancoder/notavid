// End-to-end check of the built extension on live YouTube (`make exttest`).
// Loads extension/.output/chrome-mv3 into Playwright's Chromium, headless —
// branded Chrome no longer accepts --load-extension. Screenshots land in
// <repo>/.playwright/.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXT = path.join(ROOT, "extension/.output/chrome-mv3");
const OUT = path.join(ROOT, ".playwright");
const PROFILE = path.join(OUT, "ext-profile");
if (!fs.existsSync(path.join(EXT, "manifest.json"))) {
  console.error("no build at extension/.output/chrome-mv3 — run `make ext` first");
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });

const VIDEO = "aqz-KE-bpKQ"; // Big Buck Bunny — unmonetized, no ads
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--autoplay-policy=no-user-gesture-required"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => m.type() === "error" && /notavid|svelte|milkdown/i.test(m.text()) && console.log("CONSOLE", m.text()));

await page.goto(`https://www.youtube.com/watch?v=${VIDEO}`, { waitUntil: "domcontentloaded" });

const host = page.locator("notavid-panel");
check("panel mounts on watch page", await until(async () => (await host.count()) > 0 && (await host.evaluate((h) => h.style.display === "block"))));
const parent = await host.evaluate((h) => h.parentElement?.id);
check("panel docked in right column", parent === "secondary-inner", `parent=#${parent}`);

const editor = page.locator("notavid-panel .ProseMirror");
check("editor renders", await until(async () => (await editor.count()) > 0));

const video = (fn) => page.evaluate(fn);
const vstate = () =>
  video(() => {
    const v = document.querySelector("#movie_player video.html5-main-video");
    return v ? { paused: v.paused, t: v.currentTime } : null;
  });
const play = () => video(() => { const v = document.querySelector("#movie_player video.html5-main-video"); v.muted = true; return v.play().then(() => true, () => false); });

await until(async () => (await vstate()) != null);
await play();
check("video starts playing", await until(async () => (await vstate())?.paused === false));

// ---- auto off: typing YouTube shortcut letters must not reach YouTube ----
await page.locator("notavid-panel button.auto").click(); // default on → off
check("auto toggled off", (await page.locator("notavid-panel button.auto").getAttribute("aria-checked")) === "false");
await play();
await until(async () => (await vstate())?.paused === false);
const before = await vstate();
await editor.click();
await page.keyboard.type("kkjf/ ", { delay: 60 });
await page.waitForTimeout(500);
const after = await vstate();
const fullscreen = await page.evaluate(() => !!document.fullscreenElement);
const searchFocused = await page.evaluate(() => document.activeElement?.matches?.("input#search, input[name=search_query]") ?? false);
check("YouTube shortcuts (k/j/f//) don't fire while typing", after.paused === false && after.t >= before.t - 1 && !fullscreen && !searchFocused,
  `paused=${after.paused} t ${before.t.toFixed(1)}→${after.t.toFixed(1)} fs=${fullscreen} search=${searchFocused}`);

// ---- auto on: typing pauses, quiet resumes ----
await page.locator("notavid-panel button.auto").click();
await editor.click();
await page.keyboard.press("End");
await page.keyboard.type("Notes about the bunny", { delay: 40 });
check("typing pauses the video", await until(async () => (await vstate())?.paused === true, 3000));
const countdown = await page.locator("notavid-panel .resuming").textContent().catch(() => null);
check("resume countdown shown", !!countdown && /resuming in [123]s/.test(countdown), countdown ?? "none");
check("video resumes after the quiet delay", await until(async () => (await vstate())?.paused === false, 8000));

// manual pause stays paused
await video(() => document.querySelector("#movie_player video.html5-main-video").pause());
await editor.click();
await page.keyboard.type(" more", { delay: 40 });
await page.waitForTimeout(4500);
check("a video the user paused stays paused", (await vstate())?.paused === true);

// ---- timestamp insert + seek ----
await play();
await until(async () => (await vstate())?.paused === false);
await video(() => { document.querySelector("#movie_player video.html5-main-video").currentTime = 42; });
await page.waitForTimeout(400);
await editor.click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.press("Alt+KeyT");
const link = page.locator('notavid-panel .ProseMirror a[href*="t=4"]');
check("Alt+T inserts a timestamp link", await until(async () => (await link.count()) > 0, 3000), await link.first().textContent().catch(() => ""));
await page.keyboard.type(" big bunny appears", { delay: 30 });
await page.keyboard.type("\nPlain time 1:30 here", { delay: 30 });
await video(() => { document.querySelector("#movie_player video.html5-main-video").currentTime = 200; });
await page.locator("notavid-panel .nv-timestamp", { hasText: "1:30" }).click();
check("clicking a plain 1:30 timestamp seeks", await until(async () => Math.abs((await vstate()).t - 90) < 3, 3000), `t=${(await vstate()).t.toFixed(1)}`);
await link.first().click();
check("clicking a timestamp link seeks", await until(async () => Math.abs((await vstate()).t - 42) < 3, 3000), `t=${(await vstate()).t.toFixed(1)}`);
check("seeking starts playback", await until(async () => (await vstate())?.paused === false, 3000));

// ---- Notavid look: brand mark and the status bar ----
check("Notavid brand + auto-pause status bar",
  (await page.locator("notavid-panel .brand-mark").count()) === 1 &&
  /Auto-pause on|Paused while you write/.test((await page.locator("notavid-panel .status").textContent()) ?? ""));

// ---- right-click menu ----
// Select text inside the panel's shadow root the way a user drag would.
const selectText = (text, collapseToEnd = false) =>
  page.evaluate(({ text, collapseToEnd }) => {
    const root = document.querySelector("notavid-panel").shadowRoot;
    const walker = document.createTreeWalker(root.querySelector(".ProseMirror"), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.data.indexOf(text);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(n, collapseToEnd ? i + text.length : i);
      range.setEnd(n, i + text.length);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const r = range.getBoundingClientRect();
      return { x: r.left + Math.max(1, r.width / 2), y: r.top + r.height / 2 };
    }
    return null;
  }, { text, collapseToEnd });
const menu = page.locator("notavid-panel .menu");
const openMenu = async (text, collapseToEnd = false) => {
  // Centered, so it isn't hidden under YouTube's fixed header.
  await editor.locator("p", { hasText: text }).first().evaluate((p) => p.scrollIntoView({ block: "center" }));
  const at = await selectText(text, collapseToEnd);
  await page.waitForTimeout(150); // ProseMirror reads the selection on selectionchange
  await page.mouse.click(at.x, at.y, { button: "right" });
  return until(async () => (await menu.count()) === 1, 2000);
};

await editor.locator("p").last().click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("format these words", { delay: 20 });
check("right-click opens the formatting menu", await openMenu("these"));
const actions = await menu.locator("[data-action]").evaluateAll((els) => els.map((e) => e.dataset.action));
await page.screenshot({ path: path.join(OUT, "ext-menu.png") });
check("menu offers bold, italic, link and image", ["bold", "italic", "link", "image"].every((a) => actions.includes(a)), actions.join(","));
await menu.locator('[data-action="bold"]').click();
check("menu Bold bolds the selection", await until(async () => (await editor.locator("strong", { hasText: "these" }).count()) === 1, 2000));
check("menu closes after picking", (await menu.count()) === 0);

await openMenu("these");
await page.keyboard.press("Escape");
check("Escape closes the menu", await until(async () => (await menu.count()) === 0, 1000));

await openMenu("format");
await menu.locator('[data-action="link"]').click();
const linkInput = page.locator("notavid-panel .milkdown-link-edit input");
check("menu Link opens the link field", await until(() => linkInput.isVisible(), 2000));
await linkInput.click(); // a click inside used to count as "outside" and close it
await page.keyboard.type("https://example.com/notes", { delay: 10 });
await page.locator("notavid-panel .milkdown-link-edit .confirm").click();
check("link field accepts a click + confirm", await until(async () => (await editor.locator('a[href^="https://example.com/notes"]').count()) === 1, 2000));

await openMenu("words", true);
await menu.locator('[data-action="image"]').click();
const imageField = page.locator("notavid-panel .milkdown-image-block .link-input-area");
check("menu Image adds an image block with a link field", await until(() => imageField.isVisible(), 2000));
// Crepe lays its "or paste an image link" text over the field; clicking it focuses the field.
await page.locator("notavid-panel .milkdown-image-block .placeholder .text").click();
await page.keyboard.type(`https://i.ytimg.com/vi/${VIDEO}/mqdefault.jpg`, { delay: 5 });
await page.keyboard.press("Enter");
check("image from a link shows", await until(async () => (await editor.locator('.milkdown-image-block img[src*="ytimg"]').count()) === 1, 4000));

// ---- drag & drop an image file ----
await page.evaluate(async () => {
  const pm = document.querySelector("notavid-panel").shadowRoot.querySelector(".ProseMirror");
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 36;
  const g = canvas.getContext("2d");
  g.fillStyle = "#f00";
  g.fillRect(0, 0, 64, 36);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(new File([blob], "red.png", { type: "image/png" }));
  const r = pm.querySelector("p").getBoundingClientRect();
  const init = { dataTransfer, clientX: r.left + 4, clientY: r.top + r.height / 2, bubbles: true, cancelable: true, composed: true };
  for (const type of ["dragenter", "dragover", "drop"]) pm.dispatchEvent(new DragEvent(type, init));
});
check("dropping an image file adds it to the note", await until(async () => (await editor.locator('img[src^="data:image/"]').count()) === 1, 4000));

// ---- lyrics ----
await page.locator('notavid-panel [role="tab"][data-tab="transcript"]').click();
const lyrics = page.locator("notavid-panel .lyrics");
check("transcript tab: a silent film with no song falls through to lyrics search", await until(async () => /No lyrics found/.test((await lyrics.textContent()) ?? ""), 20000),
  ((await lyrics.textContent()) ?? "").slice(0, 120));
await lyrics.locator("input[type=search]").fill("Rick Astley Never Gonna Give You Up");
await lyrics.locator("form button[type=submit]").click();
const result = lyrics.locator(".results button").first();
check("lyrics: search lists songs", await until(async () => (await result.count()) > 0, 15000));
await result.click();
const lines = lyrics.locator(".line");
check("lyrics: picking a song shows timed lines", await until(async () => (await lines.count()) > 10, 5000), `${await lines.count()} lines`);
await video(() => { document.querySelector("#movie_player video.html5-main-video").currentTime = 40; });
check("lyrics: the playing line is highlighted", await until(async () => (await lyrics.locator(".line.active").count()) === 1, 3000));
const sung = lines.filter({ has: page.locator(".add") }).nth(6);
const sungText = ((await sung.locator(".line-text").textContent()) ?? "").trim();
await sung.locator(".line-text").click();
check("lyrics: clicking a line seeks there", await until(async () => ((await lyrics.locator(".line.active .line-text").textContent()) ?? "").trim() === sungText, 3000), sungText);
await lyrics.locator('[aria-label="Show lyrics later"]').click();
check("lyrics: timing can be shifted", ((await lyrics.locator(".offset .time").textContent()) ?? "").trim() === "+0.5s");
await sung.hover();
await sung.locator(".add").click();
await page.screenshot({ path: path.join(OUT, "ext-lyrics.png") });
await page.locator('notavid-panel [role="tab"][data-tab="notes"]').click();
check("lyrics: a line can be added to the note", await until(async () => (await editor.locator("blockquote", { hasText: sungText }).count()) === 1, 3000));

await page.screenshot({ path: path.join(OUT, "ext-light.png") });

// ---- saved + history ----
await page.waitForTimeout(800);
await page.locator('notavid-panel [role="tab"]', { hasText: "History" }).click();
const row = page.locator("notavid-panel .history li");
check("history lists the note", await until(async () => (await row.count()) === 1, 3000));
const title = await row.locator(".title").textContent();
check("note titled from the video", /Big Buck Bunny/i.test(title ?? ""), title ?? "");
check("history thumbnail loads", await until(() => row.locator("img").evaluate((i) => i.complete && i.naturalWidth > 0), 8000));
await page.screenshot({ path: path.join(OUT, "ext-history.png") });

// persists across reload
await page.reload({ waitUntil: "domcontentloaded" });
await until(async () => (await editor.count()) > 0);
check("note persists after reload", await until(async () => /Notes about the bunny/.test((await editor.textContent()) ?? ""), 8000));
check("dropped image persists after reload", await until(async () => (await editor.locator('img[src^="data:image/"]').count()) === 1, 4000),
  `${await editor.locator('img[src^="data:image/"]').count()} data images, ${await editor.locator("img").count()} images`);

// SPA navigation to another video gives a fresh note
await page.evaluate(() => {
  const a = [...document.querySelectorAll("#secondary a[href*='/watch?v=']")].find((el) => !el.href.includes("aqz-KE-bpKQ") && el.offsetParent);
  a?.click();
});
const moved = await until(async () => !page.url().includes(VIDEO), 10000);
if (moved) {
  check("SPA navigation: new video gets an empty note", await until(async () => !/Notes about the bunny/.test((await editor.textContent().catch(() => "")) ?? ""), 8000));
  await page.goBack({ waitUntil: "domcontentloaded" });
  check("back navigation restores the note", await until(async () => /Notes about the bunny/.test((await editor.textContent().catch(() => "")) ?? ""), 10000));
} else {
  console.log("SKIP SPA navigation (no related video link found)");
}

// dark theme
await page.evaluate(() => document.documentElement.setAttribute("dark", ""));
await page.waitForTimeout(300);
const theme = await page.locator("notavid-panel .nv").getAttribute("data-theme");
check("follows YouTube dark mode", theme === "dark");
await page.screenshot({ path: path.join(OUT, "ext-dark.png") });

// ---- language: browser's by default, or picked in settings ----
await page.locator("notavid-panel header .icon-btn[aria-expanded]").click();
await page.locator('notavid-panel .chip.lang[data-lang="ar"]').click();
const notesTab = page.locator('notavid-panel [role="tab"][data-tab="notes"]');
check("language: Arabic switches the panel to RTL Arabic", await until(async () =>
  ((await notesTab.textContent()) ?? "").includes("الملاحظات") && (await page.locator("notavid-panel .nv").getAttribute("dir")) === "rtl", 2000));
await page.screenshot({ path: path.join(OUT, "ext-arabic.png") });
await page.locator('notavid-panel .chip.lang[data-lang="system"]').click();
check("language: back to the browser's (English here)", await until(async () => ((await notesTab.textContent()) ?? "").includes("Notes"), 2000));
await page.keyboard.press("Escape");
check("Escape closes settings", await until(async () => (await page.locator("notavid-panel .sheet").count()) === 0, 1000));

// ---- layouts: one column when narrow, theater mode, hidden off watch pages ----
const placement = () =>
  page.evaluate(() => {
    const h = document.querySelector("notavid-panel");
    return h && { parent: h.parentElement?.id, shown: h.style.display === "block", layout: h.shadowRoot.querySelector(".nv")?.dataset.layout };
  });
await page.setViewportSize({ width: 820, height: 900 });
check("narrow window: panel moves under the video", await until(async () => {
  const p = await placement();
  return p?.shown && p.parent === "below" && p.layout === "narrow";
}));
await page.screenshot({ path: path.join(OUT, "ext-narrow.png") });
await page.setViewportSize({ width: 1400, height: 900 });
await until(async () => (await placement())?.layout === "default");
await page.evaluate(() => document.querySelector(".ytp-size-button")?.click());
check("theater mode: panel stays in the right column", await until(async () => {
  const p = await placement();
  return p?.shown && p.parent === "secondary-inner" && p.layout === "theater";
}, 6000));

// ---- popup: same history from the toolbar ----
// The extension has no background worker to read its id from; the extensions
// page can list it.
const extPage = await ctx.newPage();
await extPage.goto("chrome://extensions");
const extId = await extPage.evaluate(() => chrome.management.getAll().then((all) => all.find((e) => e.name.startsWith("Notavid"))?.id));
await extPage.close();
const pop = await ctx.newPage();
await pop.goto(`chrome-extension://${extId}/popup.html`);
check("popup history lists the note", await until(async () => (await pop.locator(".history li").count()) >= 1, 3000));
check("popup has the Notavid brand and switch", (await pop.locator(".brand-mark").count()) === 1 && (await pop.locator('.toggle[role="switch"]').count()) === 1);
await until(() => pop.locator(".history img").first().evaluate((i) => i.complete && i.naturalWidth > 0), 8000);
await pop.screenshot({ path: path.join(OUT, "ext-popup.png") });

// ---- transcript: the video's own, read from YouTube's transcript panel ----
await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { waitUntil: "domcontentloaded" });
const transcriptTab = page.locator('notavid-panel [role="tab"][data-tab="transcript"]');
await until(async () => (await transcriptTab.count()) === 1);
await transcriptTab.click();
const tview = page.locator("notavid-panel .transcript");
await tview.locator('[data-mode="transcript"]').click();
const tlines = tview.locator(".line");
check("transcript: YouTube's transcript shows in the tab", await until(async () => (await tlines.count()) > 10, 25000),
  `${await tlines.count()} lines; ${((await tview.textContent()) ?? "").slice(0, 80)}`);
check("transcript: has the words and timestamps", /never gonna give you up/i.test((await tview.textContent()) ?? "") && (await tview.locator(".stamp").count()) > 10);
check("transcript: YouTube's own panel is closed again", await until(() => page.evaluate(() =>
  !document.documentElement.hasAttribute("data-notavid-transcript") &&
  ![...document.querySelectorAll('ytd-engagement-panel-section-list-renderer[target-id*="transcript"]')].some((p) => p.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED")), 3000));
await tview.locator(".filter input").fill("desert");
check("transcript: search narrows the lines", await until(async () => (await tlines.count()) >= 1 && (await tlines.count()) < 10, 2000), `${await tlines.count()} lines`);
await tview.locator(".filter input").fill("");
await page.locator("notavid-panel").screenshot({ path: path.join(OUT, "ext-transcript.png") });
await tview.locator('[data-mode="lyrics"]').click();
check("lyrics: a music video finds its song by itself", await until(async () =>
  /Never Gonna Give You Up/i.test((await page.locator("notavid-panel .lyrics .song .track").textContent().catch(() => "")) ?? ""), 25000));

await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded" });
check("panel hidden off watch pages", await until(async () => (await placement())?.shown === false, 8000));

await ctx.close();
fs.rmSync(PROFILE, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed · screenshots in .playwright/`);
process.exit(failed.length ? 1 : 0);
