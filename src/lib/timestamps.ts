import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";

/** Plain-text timestamps: 0:00, 12:34, 1:02:33. */
export const TIMESTAMP_RE = /\b(?:\d{1,2}:)?\d{1,2}:[0-5]\d\b/g;
const EXACT_TIMESTAMP_RE = /^(?:\d{1,2}:)?\d{1,2}:[0-5]\d$/;

/**
 * "1:02:33" → seconds, or null if it isn't exactly a timestamp — decorations
 * can render as fragment spans ("1", "02"), and those must not seek.
 */
export function parseTimestamp(text: string): number | null {
  const trimmed = text.trim();
  if (!EXACT_TIMESTAMP_RE.test(trimmed)) return null;
  return trimmed
    .split(":")
    .map(Number)
    .reduce((total, p) => total * 60 + p, 0);
}

/**
 * Milkdown plugin giving plain-text timestamps a YouTube-style highlight via
 * decorations — the markdown file keeps the plain text. Clicks are handled
 * by the editor component and seek the video.
 */
function buildDecorations(doc: Node): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    // Timestamp links from the insert button are already styled.
    if (node.marks.some((m) => m.type.name === "link")) return;
    TIMESTAMP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TIMESTAMP_RE.exec(node.text ?? ""))) {
      decos.push(
        Decoration.inline(pos + m.index, pos + m.index + m[0].length, {
          class: "nv-timestamp",
        }),
      );
    }
  });
  return DecorationSet.create(doc, decos);
}

export const timestampHighlighter = $prose(
  () =>
    new Plugin<DecorationSet>({
      state: {
        init: (_, state) => buildDecorations(state.doc),
        // Rescan only when the document changes; selection-only transactions
        // (every cursor move) reuse the existing set untouched.
        apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
      },
    }),
);
