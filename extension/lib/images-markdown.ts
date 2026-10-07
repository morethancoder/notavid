import { $remark } from "@milkdown/kit/utils";

interface MdNode {
  type: string;
  title?: string | null;
  children?: MdNode[];
}

/**
 * An image written without a title — `![1.00](src)`, which is how Crepe
 * saves an image block with no caption — parses back with a null title, and
 * Crepe's image block rejects null captions ("Expected value of type string
 * for attribute caption"). The image would vanish on the next load, so give
 * every image an empty title instead.
 */
export const imageTitleFix = $remark("notavidImageTitle", () => () => (tree: unknown) => {
  const walk = (node: MdNode) => {
    if ((node.type === "image" || node.type === "image-block") && node.title == null) node.title = "";
    node.children?.forEach(walk);
  };
  walk(tree as MdNode);
});
