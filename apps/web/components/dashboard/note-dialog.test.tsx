import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../app/notes/[id]/Editor", () => ({
  Editor: ({ noteId }: { noteId: string }) => <div data-testid="editor">editor:{noteId}</div>,
}));
vi.mock("./access-control", () => ({
  AccessControl: ({ access }: { access: string }) => (
    <div data-testid="access">access:{access}</div>
  ),
}));

const useNoteMock = vi.fn();
vi.mock("../../lib/queries/notes", () => ({ useNote: (id: string) => useNoteMock(id) }));

import { NoteDialog } from "./note-dialog";

describe("NoteDialog", () => {
  it("renders nothing interactive when noteId is null", () => {
    useNoteMock.mockReturnValue({ data: undefined });
    render(<NoteDialog noteId={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
  });

  it("renders the editor and owner access control for an owned note", async () => {
    useNoteMock.mockReturnValue({
      data: { id: "n1", title: "Q3 Launch", access: "private", isOwner: true },
    });
    render(<NoteDialog noteId="n1" onClose={vi.fn()} />);
    expect(await screen.findByTestId("editor")).toHaveTextContent("editor:n1");
    expect(screen.getByTestId("access")).toHaveTextContent("access:private");
    // Title comes through as the dialog's accessible name (sr-only), not a visible field.
    expect(screen.getByText("Q3 Launch")).toBeInTheDocument();
  });

  it("hides owner access control for a non-owned note", async () => {
    useNoteMock.mockReturnValue({
      data: { id: "n2", title: "Roadmap", access: "view", isOwner: false },
    });
    render(<NoteDialog noteId="n2" onClose={vi.fn()} />);
    expect(await screen.findByTestId("editor")).toBeInTheDocument();
    expect(screen.queryByTestId("access")).not.toBeInTheDocument();
  });
});
