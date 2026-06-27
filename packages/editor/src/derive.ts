/**
 * Pure, framework-free derivation of a note's `{ title, preview, text }` from its document.
 *
 * Runs under Bun in `socket` with no React/DOM/TipTap imports (ADR-001): the server converts a
 * Yjs doc to ProseMirror JSON (`@hocuspocus/transformer`) and feeds it here to write the derived
 * metadata onto `note`. The same shape backs the web dashboard's title/preview.
 */

/** Y.Doc XML-fragment field the TipTap `Collaboration` extension binds to (its default). */
export const COLLAB_FIELD = "default";

/** Minimal slice of a ProseMirror node we walk for derivation. */
export interface PmNode {
  type?: string;
  text?: string;
  content?: PmNode[];
}

export interface TitlePreview {
  /** First non-empty block's text, capped. `"Untitled"` when the doc has no text. */
  title: string;
  /** Excerpt of the text after the title block, capped. */
  preview: string;
  /** Full plain text, blocks joined by newlines. */
  text: string;
}

const FALLBACK_TITLE = "Untitled";
const MAX_TITLE = 100;
const MAX_PREVIEW = 200;

/** Concatenate all descendant text of a node (leaf text nodes carry `.text`). */
function nodeText(node: PmNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(nodeText).join("");
}

/** Per top-level block, its collapsed text; empty blocks are dropped. */
function collectBlocks(doc: PmNode | null | undefined): string[] {
  const blocks: string[] = [];
  for (const node of doc?.content ?? []) {
    const text = nodeText(node).replace(/\s+/g, " ").trim();
    if (text) blocks.push(text);
  }
  return blocks;
}

/** Cap to `max` characters, appending an ellipsis when truncated. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}…`;
}

export function extractTitlePreview(doc: PmNode | null | undefined): TitlePreview {
  const blocks = collectBlocks(doc);
  const title = blocks.length > 0 ? truncate(blocks[0] as string, MAX_TITLE) : FALLBACK_TITLE;
  const preview = truncate(blocks.slice(1).join(" "), MAX_PREVIEW);
  return { title, preview, text: blocks.join("\n") };
}
