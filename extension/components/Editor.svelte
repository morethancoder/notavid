<script lang="ts">
  import { onMount } from "svelte";
  import { CrepeBuilder } from "@milkdown/crepe/builder";
  import { blockEdit } from "@milkdown/crepe/feature/block-edit";
  import { cursor } from "@milkdown/crepe/feature/cursor";
  import { imageBlock } from "@milkdown/crepe/feature/image-block";
  import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";
  import { listItem } from "@milkdown/crepe/feature/list-item";
  import { placeholder as placeholderFeature } from "@milkdown/crepe/feature/placeholder";
  import { table } from "@milkdown/crepe/feature/table";
  import { toolbar } from "@milkdown/crepe/feature/toolbar";
  import type { Ctx } from "@milkdown/kit/ctx";
  import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
  import { imageBlockSchema } from "@milkdown/kit/component/image-block";
  import { toggleLinkCommand } from "@milkdown/kit/component/link-tooltip";
  import { upload, uploadConfig } from "@milkdown/kit/plugin/upload";
  import {
    blockquoteSchema,
    bulletListSchema,
    emphasisSchema,
    headingSchema,
    inlineCodeSchema,
    isMarkSelectedCommand,
    linkSchema,
    liftListItemCommand,
    paragraphSchema,
    setBlockTypeCommand,
    strongSchema,
    toggleEmphasisCommand,
    toggleInlineCodeCommand,
    toggleStrongCommand,
    wrapInBlockTypeCommand,
  } from "@milkdown/kit/preset/commonmark";
  import { strikethroughSchema, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
  import { lift } from "@milkdown/kit/prose/commands";
  import type { NodeType } from "@milkdown/kit/prose/model";
  import { Decoration } from "@milkdown/kit/prose/view";
  import { insert } from "@milkdown/kit/utils";
  import EditorMenu, { type MenuItem } from "./EditorMenu.svelte";
  import { timestampHighlighter, parseTimestamp } from "../lib/timestamps";
  import { imageFiles, imageToDataUrl } from "../lib/images";
  import { imageTitleFix } from "../lib/images-markdown";
  import { settings, t } from "../lib/settings.svelte";
  import "../styles/crepe.css";

  let {
    value = "",
    noteId = "",
    placeholder = "",
    onchange,
    onactivity,
    oneditorblur,
    ontimestampclick,
    ontimestampshortcut,
  }: {
    value?: string;
    /** The note this editor was opened for; every change is reported against it. */
    noteId?: string;
    placeholder?: string;
    onchange?: (markdown: string, noteId: string) => void;
    onactivity?: () => void;
    oneditorblur?: () => void;
    ontimestampclick?: (seconds: number) => void;
    ontimestampshortcut?: () => void;
  } = $props();

  let root: HTMLDivElement;
  let crepe: CrepeBuilder | null = null;
  const stripWs = (s: string) => s.replace(/\s+/g, "");
  // svelte-ignore state_referenced_locally -- the initial content is the diff baseline
  let lastStripped = stripWs(value);
  // svelte-ignore state_referenced_locally -- fixed for this editor's lifetime (it's keyed on the note)
  const id = noteId;
  /** The markdown last handed to onchange (or loaded), to tell if anything is unsaved. */
  let lastMarkdown: string | null = null;

  function report(markdown: string) {
    lastMarkdown = markdown;
    onchange?.(markdown, id);
  }

  /**
   * Hand over edits Milkdown hasn't reported yet: its listener waits 200ms
   * after the last change and drops that wait when the editor is destroyed,
   * so switching tabs or videos right after typing or dropping an image
   * would lose it.
   */
  export function sync() {
    if (!crepe || lastMarkdown == null) return;
    const markdown = crepe.getMarkdown();
    if (markdown !== lastMarkdown) report(markdown);
  }

  /** Image files → image blocks with their pixels inlined as data: URLs. */
  async function imageNodes(files: File[], ctx: Ctx) {
    const type = imageBlockSchema.type(ctx);
    const srcs = await Promise.all(files.map(imageToDataUrl));
    return srcs.map((src) => type.create({ src }));
  }

  onMount(() => {
    // Built feature by feature rather than with `new Crepe()`, which bundles
    // every feature: this runs on every YouTube page, and LaTeX (KaTeX) plus
    // CodeMirror's language packs would add ~2 MB. Code blocks stay plain.
    const instance = new CrepeBuilder({ root, defaultValue: value })
      .addFeature(cursor)
      .addFeature(listItem)
      .addFeature(linkTooltip, { inputPlaceholder: t("linkPlaceholder") })
      .addFeature(imageBlock, {
        onUpload: imageToDataUrl,
        blockUploadButton: t("imageUpload"),
        blockUploadPlaceholderText: t("imageLinkPlaceholder"),
        blockCaptionPlaceholderText: t("imageCaptionPlaceholder"),
        blockConfirmButton: t("confirm"),
        inlineUploadButton: t("imageUpload"),
        inlineUploadPlaceholderText: t("imageLinkPlaceholder"),
      })
      .addFeature(blockEdit)
      .addFeature(placeholderFeature, { text: placeholder, mode: "block" })
      .addFeature(toolbar, {
        boldLabel: t("bold"),
        italicLabel: t("italic"),
        strikethroughLabel: t("strikethrough"),
        codeLabel: t("inlineCode"),
        linkLabel: t("link"),
      })
      .addFeature(table);
    instance.editor.use(timestampHighlighter).use(imageTitleFix);
    // Dropped or pasted image files become image blocks.
    instance.editor
      .config((ctx) => {
        ctx.update(uploadConfig.key, (prev) => ({
          ...prev,
          uploader: async (files, _schema, ctx) => imageNodes(imageFiles(files), ctx),
          // Dropped at the very start or end of a line: go between blocks
          // rather than splitting the line and leaving an empty one behind.
          getInsertPos: (_event, ctx, pos) => {
            const at = ctx.get(editorViewCtx).state.doc.resolve(pos);
            if (!at.parent.isTextblock || at.depth === 0) return pos;
            if (at.parentOffset === 0) return at.before();
            if (at.parentOffset === at.parent.content.size) return at.after();
            return pos;
          },
          uploadWidgetFactory: (pos, spec) => {
            const el = document.createElement("span");
            el.className = "nv-uploading";
            el.textContent = t("uploading");
            return Decoration.widget(pos, el, spec);
          },
        }));
      })
      .use(upload);
    instance.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        // A change that only adds/removes whitespace is not "typing" when
        // ignoreWhitespace is on.
        const stripped = stripWs(markdown);
        const whitespaceOnly = stripped === lastStripped;
        lastStripped = stripped;
        report(markdown);
        if (!(settings.ignoreWhitespace && whitespaceOnly)) onactivity?.();
      });
      listener.blur(() => {
        // Picking from our own menu doesn't count as leaving the note.
        if (!menu) oneditorblur?.();
      });
    });
    instance.create().then(() => {
      crepe = instance;
      // Crepe normalizes the markdown it serializes, so re-baseline against
      // its own form or the first whitespace-only edit reads as typing.
      lastMarkdown = instance.getMarkdown();
      lastStripped = stripWs(lastMarkdown);
    });
    return () => {
      sync();
      crepe = null;
      instance.destroy();
    };
  });

  export function insertMarkdown(markdown: string) {
    crepe?.editor.action(insert(markdown, true));
  }

  /** Images dropped on the panel outside the text itself land at the cursor. */
  export async function insertImages(files: File[]) {
    if (!crepe || !files.length) return;
    const nodes = await crepe.editor.action((ctx) => imageNodes(files, ctx));
    crepe?.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let tr = view.state.tr;
      for (const node of nodes) tr = tr.replaceSelectionWith(node);
      view.dispatch(tr);
    });
  }

  // ---- right-click menu ----------------------------------------------------
  let menu = $state<{ x: number; y: number; groups: MenuItem[][] } | null>(null);

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const key = (k: string) => (isMac ? `⌘${k}` : `Ctrl+${k}`);

  function inBlock(ctx: Ctx, type: NodeType): boolean {
    const from = ctx.get(editorViewCtx).state.selection.$from;
    for (let d = from.depth; d > 0; d--) if (from.node(d).type === type) return true;
    return false;
  }

  function buildMenu(ctx: Ctx): MenuItem[][] {
    const commands = ctx.get(commandsCtx);
    const view = ctx.get(editorViewCtx);
    const run = (fn: () => void) => () => {
      view.focus();
      fn();
    };
    const call = (command: Parameters<typeof commands.call>[0], payload?: unknown) =>
      run(() => commands.call(command, payload));
    const marked = (schema: { type: (ctx: Ctx) => unknown }) =>
      commands.call(isMarkSelectedCommand.key, schema.type(ctx) as never);
    const heading = headingSchema.type(ctx);
    const inHeading = inBlock(ctx, heading);
    const inList = inBlock(ctx, bulletListSchema.type(ctx));
    const inQuote = inBlock(ctx, blockquoteSchema.type(ctx));

    return [
      [
        { id: "bold", label: t("bold"), icon: "bold", shortcut: key("B"), active: marked(strongSchema), run: call(toggleStrongCommand.key) },
        { id: "italic", label: t("italic"), icon: "italic", shortcut: key("I"), active: marked(emphasisSchema), run: call(toggleEmphasisCommand.key) },
        { id: "strike", label: t("strikethrough"), icon: "strikethrough", active: marked(strikethroughSchema), run: call(toggleStrikethroughCommand.key) },
        { id: "code", label: t("inlineCode"), icon: "code", active: marked(inlineCodeSchema), run: call(toggleInlineCodeCommand.key) },
      ],
      [
        { id: "link", label: t("link"), icon: "link", active: marked(linkSchema), run: call(toggleLinkCommand.key) },
        {
          id: "image",
          label: t("image"),
          icon: "image",
          // An empty image block shows Crepe's "upload / paste a link" field.
          run: run(() => {
            const { state } = view;
            view.dispatch(state.tr.replaceSelectionWith(imageBlockSchema.type(ctx).create()));
          }),
        },
        { id: "timestamp", label: t("timestamp"), icon: "schedule", shortcut: "Alt+T", run: run(() => ontimestampshortcut?.()) },
      ],
      [
        {
          id: "heading",
          label: t("heading"),
          icon: "title",
          active: inHeading,
          run: inHeading
            ? call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) })
            : call(setBlockTypeCommand.key, { nodeType: heading, attrs: { level: 2 } }),
        },
        {
          id: "list",
          label: t("bulletList"),
          icon: "list",
          active: inList,
          run: inList ? call(liftListItemCommand.key) : call(wrapInBlockTypeCommand.key, { nodeType: bulletListSchema.type(ctx) }),
        },
        {
          id: "quote",
          label: t("quote"),
          icon: "quote",
          active: inQuote,
          run: inQuote
            ? run(() => lift(view.state, view.dispatch))
            : call(wrapInBlockTypeCommand.key, { nodeType: blockquoteSchema.type(ctx) }),
        },
      ],
    ];
  }

  function handleContextMenu(e: MouseEvent) {
    // Shift + right-click keeps the browser's own menu (spelling, paste…).
    if (e.shiftKey || !crepe) return;
    const target = e.target as HTMLElement;
    // Inputs inside Crepe widgets (link field, image caption) keep theirs too.
    if (target.closest("input, textarea") || !target.closest(".ProseMirror")) return;
    e.preventDefault();
    const groups = crepe.editor.action(buildMenu);
    menu = { x: e.clientX, y: e.clientY, groups };
  }

  // Keys that move around the note without editing it — reading back through
  // notes must not pause the video. Real edits are also caught by
  // markdownUpdated, so filtering here can't miss actual typing.
  const nonTypingKeys = new Set([
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown",
    "Home", "End", "Shift", "Control", "Alt", "Meta", "CapsLock", "Escape",
    "ContextMenu",
  ]);

  // Keys whose effect may be whitespace-only; with ignoreWhitespace on they
  // defer to the content diff in markdownUpdated instead of pausing here.
  const whitespaceKeys = new Set([" ", "Enter", "Tab", "Backspace", "Delete"]);

  function handleKeydown(e: KeyboardEvent) {
    // Alt+T — match the physical key, since macOS Option+T types "†".
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyT") {
      e.preventDefault();
      ontimestampshortcut?.();
      return;
    }
    if (e.ctrlKey || e.metaKey || nonTypingKeys.has(e.key)) return;
    if (settings.ignoreWhitespace && whitespaceKeys.has(e.key)) return;
    onactivity?.();
  }

  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const stamp = target.closest(".nv-timestamp");
    if (stamp) {
      const seconds = parseTimestamp(stamp.textContent ?? "");
      if (seconds != null) {
        ontimestampclick?.(seconds);
        return;
      }
    }
    const anchor = target.closest("a");
    if (!anchor?.href) return;
    e.preventDefault();
    // Timestamp links ([m:ss](https://youtu.be/ID?t=N)) seek the video.
    try {
      const t = new URL(anchor.href).searchParams.get("t");
      if (t && /^\d+$/.test(t)) {
        e.stopPropagation();
        ontimestampclick?.(parseInt(t, 10));
        return;
      }
    } catch {
      // not a URL we care about
    }
    // Other links open in a new tab on Ctrl/⌘-click; a plain click edits.
    if (e.ctrlKey || e.metaKey) window.open(anchor.href, "_blank", "noopener");
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
  class="editor-root"
  class:menu-open={menu}
  dir="auto"
  bind:this={root}
  onkeydowncapture={handleKeydown}
  onclickcapture={handleClick}
  oncontextmenu={handleContextMenu}
></div>

{#if menu}
  <EditorMenu x={menu.x} y={menu.y} groups={menu.groups} hint={t("browserMenuHint")} onclose={() => (menu = null)} />
{/if}

<style>
  .editor-root {
    height: 100%;
  }
  .editor-root :global(.nv-timestamp) {
    color: var(--yt-blue);
    cursor: pointer;
  }
  .editor-root :global(.nv-timestamp:hover) {
    text-decoration: underline;
  }
  /* One menu at a time: Crepe's selection toolbar steps aside for ours. */
  .editor-root.menu-open :global(.milkdown-toolbar) {
    display: none;
  }
  .editor-root :global(.nv-uploading) {
    color: var(--yt-text-secondary);
    font-size: 13px;
  }
  /* Crepe's "frame" theme — the one the Notavid desktop editor uses — on a
     transparent background with the app's Roboto body text. */
  .editor-root :global(.milkdown) {
    height: 100%;
    background: transparent;
    --crepe-color-background: transparent;
    --crepe-color-on-background: #000000;
    --crepe-color-surface: #f7f7f7;
    --crepe-color-surface-low: #ededed;
    --crepe-color-on-surface: #1c1c1c;
    --crepe-color-on-surface-variant: #4d4d4d;
    --crepe-color-outline: #a8a8a8;
    --crepe-color-primary: #333333;
    --crepe-color-secondary: #cfcfcf;
    --crepe-color-on-secondary: #000000;
    --crepe-color-inverse: #f0f0f0;
    --crepe-color-on-inverse: #1a1a1a;
    --crepe-color-inline-code: #ba1a1a;
    --crepe-color-error: #ba1a1a;
    --crepe-color-hover: #e0e0e0;
    --crepe-color-selected: #d5d5d5;
    --crepe-color-inline-area: #cacaca;
    --crepe-base-font-size: 15px;
    --crepe-font-title: "Noto Serif", Cambria, "Times New Roman", Times, serif;
    --crepe-font-default:
      "Roboto", -apple-system, BlinkMacSystemFont, "SF Arabic", "Segoe UI", "Noto Sans Arabic", Arial, sans-serif;
    --crepe-font-code: "Space Mono", "Fira Code", Menlo, Monaco, "Courier New", Courier, monospace;
    --crepe-shadow-1: 0px 1px 3px 1px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.3);
    --crepe-shadow-2: 0px 2px 6px 2px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.3);
  }
  :global(.nv[data-theme="dark"]) .editor-root :global(.milkdown) {
    --crepe-color-on-background: #e6e6e6;
    --crepe-color-surface: #121212;
    --crepe-color-surface-low: #1c1c1c;
    --crepe-color-on-surface: #d1d1d1;
    --crepe-color-on-surface-variant: #a9a9a9;
    --crepe-color-outline: #757575;
    --crepe-color-primary: #b5b5b5;
    --crepe-color-secondary: #4d4d4d;
    --crepe-color-on-secondary: #d6d6d6;
    --crepe-color-inverse: #e5e5e5;
    --crepe-color-on-inverse: #2a2a2a;
    --crepe-color-inline-code: #ff6666;
    --crepe-color-error: #ff6666;
    --crepe-color-hover: #232323;
    --crepe-color-selected: #2f2f2f;
    --crepe-color-inline-area: #2b2b2b;
    --crepe-shadow-1: 0px 1px 2px 0px rgba(255, 255, 255, 0.3), 0px 1px 3px 1px rgba(255, 255, 255, 0.15);
    --crepe-shadow-2: 0px 1px 2px 0px rgba(255, 255, 255, 0.3), 0px 2px 6px 2px rgba(255, 255, 255, 0.15);
  }
  /* Crepe's 120px gutters would eat most of a 400px column. The start gutter
     keeps room for the block handle (drag / "+" menu). */
  .editor-root :global(.milkdown .ProseMirror) {
    padding: 14px 18px 40%;
    padding-inline-start: 44px;
  }
</style>
