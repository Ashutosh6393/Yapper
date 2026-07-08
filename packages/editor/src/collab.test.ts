import { expect, test } from "bun:test";
import { TiptapTransformer } from "@hocuspocus/transformer";
import * as Y from "yjs";
import { deriveNoteMetadata } from "./collab";
import { COLLAB_FIELD, extractTitlePreview } from "./derive";

/** Build a Yjs doc whose `default` fragment mirrors TipTap output: one paragraph per line. */
function buildDoc(...lines: string[]): Y.Doc {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment(COLLAB_FIELD);
  const blocks = lines.map((line) => {
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText(line)]);
    return paragraph;
  });
  fragment.insert(0, blocks);
  return ydoc;
}

test("deriveNoteMetadata returns the title/preview of the doc's blocks", () => {
  const doc = buildDoc("Hello world", "the body text");
  expect(deriveNoteMetadata(doc)).toEqual({ title: "Hello world", preview: "the body text" });
});

test("an empty doc falls back to the Untitled title (parity with extractTitlePreview)", () => {
  const doc = buildDoc();
  expect(deriveNoteMetadata(doc)).toEqual({ title: "Untitled", preview: "" });
});

test("derives identically to the socket path (extractTitlePreview over TiptapTransformer) — goal #5", () => {
  const doc = buildDoc("A Heading", "line two", "line three");
  // Reproduce exactly what apps/socket's saveDerivedMetadata did inline before the extraction.
  const json = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD);
  const { title, preview } = extractTitlePreview(json);
  expect(deriveNoteMetadata(doc)).toEqual({ title, preview });
});
