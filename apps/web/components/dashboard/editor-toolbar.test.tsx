import { fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import { EditorToolbar } from "./editor-toolbar";

/** A stubbed TipTap editor: a stable command chain (every method returns the chain) plus the
 * read/subscribe surface the toolbar touches. `active` maps a node/mark key to its isActive result. */
function makeEditor(active: Record<string, boolean> = {}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "focus",
    "toggleHeading",
    "toggleBold",
    "toggleItalic",
    "toggleStrike",
    "toggleCode",
    "toggleBulletList",
    "toggleOrderedList",
    "toggleTaskList",
    "toggleBlockquote",
    "toggleCodeBlock",
    "run",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  const editor = {
    on: vi.fn(),
    off: vi.fn(),
    isActive: (name: string, attrs?: { level?: number }) =>
      Boolean(active[attrs?.level ? `heading${attrs.level}` : name]),
    chain: () => chain,
  } as unknown as Editor;
  return { editor, chain };
}

const LABELS = [
  "Heading 1",
  "Heading 2",
  "Heading 3",
  "Bold",
  "Italic",
  "Strikethrough",
  "Inline code",
  "Bullet list",
  "Numbered list",
  "To-do list",
  "Quote",
  "Code block",
];

describe("EditorToolbar (goal state)", () => {
  it("renders a button for every formatting action, including to-do", () => {
    const { editor } = makeEditor();
    render(<EditorToolbar editor={editor} />);
    for (const label of LABELS) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("runs the matching editor command when a button is clicked", () => {
    const { editor, chain } = makeEditor();
    render(<EditorToolbar editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(chain.toggleBold).toHaveBeenCalled();
    expect(chain.run).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "To-do list" }));
    expect(chain.toggleTaskList).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Heading 2" }));
    expect(chain.toggleHeading).toHaveBeenCalledWith({ level: 2 });
  });

  it("reflects the active mark via aria-pressed", () => {
    const { editor } = makeEditor({ bold: true });
    render(<EditorToolbar editor={editor} />);
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
  });
});
