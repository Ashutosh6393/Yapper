import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Captured HocuspocusProvider options so tests can drive the socket callbacks. */
type ProviderOpts = {
  onStateless?: (e: { payload: string }) => void;
  onAuthenticationFailed?: () => void;
  onStatus?: (e: { status: string }) => void;
};

// Hoisted so the vi.mock factories (which run before imports) can share this state with the tests.
const { hoisted, setEditable } = vi.hoisted(() => ({
  hoisted: {} as { opts?: ProviderOpts },
  setEditable: vi.fn(),
}));

vi.mock("@hocuspocus/provider", () => {
  class FakeProvider {
    document = {};
    awareness = { getStates: () => new Map(), on: () => {}, off: () => {} };
    constructor(opts: ProviderOpts) {
      hoisted.opts = opts;
    }
    disconnect() {}
    destroy() {}
  }
  return { HocuspocusProvider: FakeProvider };
});
vi.mock("@yapper/editor", () => ({ buildExtensions: () => [] }));
vi.mock("@tiptap/extension-collaboration-caret", () => ({
  CollaborationCaret: { configure: () => ({}) },
}));
vi.mock("@tiptap/extension-placeholder", () => ({ Placeholder: { configure: () => ({}) } }));
vi.mock("@tiptap/react", () => ({
  // Minimal editor shape: setEditable + updateUser plus the read/subscribe surface the toolbar touches.
  useEditor: () => ({
    setEditable,
    commands: { updateUser: vi.fn() },
    on: vi.fn(),
    off: vi.fn(),
    isActive: () => false,
  }),
  EditorContent: () => <div data-testid="content" />,
}));
vi.mock("../../../lib/auth-token", () => ({ getAuthToken: () => "tok" }));
vi.mock("@/components/ui/sonner", () => ({ toast: { error: vi.fn() } }));

import { useEditorStore } from "../../../lib/stores/editor";
import { Editor, renderCaret, renderCaretSelection } from "./Editor";

function identityPayload(permission: "view" | "edit") {
  return JSON.stringify({
    type: "identity",
    user: { id: "u1", name: "U", color: "#fff" },
    permission,
  });
}

beforeEach(() => {
  hoisted.opts = undefined;
  useEditorStore.getState().reset();
  setEditable.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe("Editor (editable-first)", () => {
  it("with assumeEditable, is editable before any identity message", () => {
    render(<Editor noteId="n1" assumeEditable />);
    expect(useEditorStore.getState().permission).toBe("edit");
    expect(setEditable).toHaveBeenCalledWith(true);
  });

  it("downgrades to read-only when the identity message says view (trigger A)", () => {
    render(<Editor noteId="n1" assumeEditable />);
    act(() => hoisted.opts?.onStateless?.({ payload: identityPayload("view") }));
    expect(useEditorStore.getState().permission).toBe("view");
    expect(setEditable).toHaveBeenLastCalledWith(false);
  });

  it("downgrades to read-only on auth failure with no identity message (trigger B)", () => {
    render(<Editor noteId="n1" assumeEditable />);
    act(() => hoisted.opts?.onAuthenticationFailed?.());
    expect(useEditorStore.getState().status).toBe("denied");
    expect(useEditorStore.getState().permission).toBe("view");
  });
});

describe("remote caret", () => {
  const user = { id: "u2", name: "Ada Lovelace", color: "oklch(0.52 0.15 210)" };

  it("renders a caret carrying the collaborator's name and stable color", () => {
    const caret = renderCaret(user);
    expect(caret.className).toContain("collaboration-carets__caret");
    expect(caret.style.getPropertyValue("--caret-color")).toBe(user.color);

    const label = caret.querySelector(".collaboration-carets__label");
    // Never an anonymous cursor: the name rides on the caret, not just the color.
    expect(label?.textContent).toBe("Ada Lovelace");
  });

  it("tints a remote selection with the same collaborator color", () => {
    expect(renderCaretSelection(user)).toEqual({
      class: "collaboration-carets__selection",
      style: `--caret-color: ${user.color}`,
    });
  });
});
