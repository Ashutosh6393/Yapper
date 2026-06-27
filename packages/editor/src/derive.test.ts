import { expect, test } from "bun:test";
import { extractTitlePreview, type PmNode } from "./derive";

/** A ProseMirror `doc` node with the given top-level block content. */
const doc = (...content: PmNode[]): PmNode => ({ type: "doc", content });
const para = (text: string): PmNode => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : [],
});
const heading = (text: string): PmNode => ({
  type: "heading",
  content: [{ type: "text", text }],
});

test("an empty doc derives the Untitled fallback and empty preview", () => {
  expect(extractTitlePreview(doc())).toEqual({ title: "Untitled", preview: "", text: "" });
});

test("the first non-empty block becomes the title; following blocks form the preview", () => {
  const result = extractTitlePreview(doc(heading("My Note"), para("Body line one"), para("two")));
  expect(result.title).toBe("My Note");
  expect(result.preview).toBe("Body line one two");
  expect(result.text).toBe("My Note\nBody line one\ntwo");
});

test("leading empty blocks are skipped when choosing the title", () => {
  const result = extractTitlePreview(doc(para(""), para("   "), heading("Real Title")));
  expect(result.title).toBe("Real Title");
  expect(result.preview).toBe("");
});

test("a long preview is truncated to an excerpt with an ellipsis", () => {
  const body = "word ".repeat(80).trim(); // ~400 chars, well over the preview cap
  const result = extractTitlePreview(doc(heading("Title"), para(body)));
  expect(result.preview.length).toBeLessThanOrEqual(201); // 200 + the ellipsis
  expect(result.preview.endsWith("…")).toBe(true);
  // The full text is preserved untruncated.
  expect(result.text).toContain(body);
});

test("inline marks and adjacent text nodes collapse into one block string", () => {
  const rich = doc({
    type: "paragraph",
    content: [
      { type: "text", text: "Hello " },
      { type: "text", text: "bold", marks: [{ type: "bold" }] } as PmNode,
      { type: "text", text: " world" },
    ],
  });
  expect(extractTitlePreview(rich).title).toBe("Hello bold world");
});
