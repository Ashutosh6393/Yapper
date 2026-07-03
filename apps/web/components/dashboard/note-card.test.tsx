import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoteCard } from "./note-card";

const note = {
  id: "n1",
  title: "Q3 Launch",
  preview: "Ship onboarding",
  access: "private" as const,
  updatedAt: "2026-06-29T00:00:00.000Z",
};

describe("NoteCard", () => {
  it("shows Private for a private owned note and opens on click", async () => {
    const onOpen = vi.fn();
    render(<NoteCard note={note} onOpen={onOpen} onDelete={vi.fn()} />);
    expect(screen.getByText("Private")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Q3 Launch"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("shows Public for a shared (view/edit) owned note", () => {
    render(<NoteCard note={{ ...note, access: "view" }} onOpen={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("shows the owner line and View/Edit badge for a shared note", () => {
    render(
      <NoteCard
        note={{ ...note, access: "edit" }}
        ownerName="Jess Park"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Jess Park's note/i)).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("calls onDelete from the overflow menu", async () => {
    const onDelete = vi.fn();
    render(<NoteCard note={note} onOpen={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /note actions/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
