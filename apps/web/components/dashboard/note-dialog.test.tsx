import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The stub exposes `onMadePrivate` as a button so a test can fire the owner's kick without a socket.
vi.mock("../../app/notes/[id]/Editor", () => ({
  Editor: ({ noteId, onMadePrivate }: { noteId: string; onMadePrivate?: () => void }) => (
    <div data-testid="editor">
      editor:{noteId}
      {onMadePrivate ? (
        <button type="button" onClick={onMadePrivate}>
          kick
        </button>
      ) : null}
    </div>
  ),
}));
const toastError = vi.fn();
vi.mock("@/components/ui/sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));
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

  it("closes a collaborator's note and tells them why when the owner makes it private", async () => {
    useNoteMock.mockReturnValue({
      data: { id: "n2", title: "Roadmap", access: "edit", isOwner: false },
    });
    const onClose = vi.fn();
    render(<NoteDialog noteId="n2" onClose={onClose} />);
    await userEvent.click(await screen.findByRole("button", { name: "kick" }));

    expect(onClose).toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Note made private by owner");
  });

  it("never kicks the owner out of their own note", async () => {
    useNoteMock.mockReturnValue({
      data: { id: "n1", title: "Q3 Launch", access: "edit", isOwner: true },
    });
    render(<NoteDialog noteId="n1" onClose={vi.fn()} />);
    await screen.findByTestId("editor");
    expect(screen.queryByRole("button", { name: "kick" })).not.toBeInTheDocument();
  });
});
