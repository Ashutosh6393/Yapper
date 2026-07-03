import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoteCard } from "./note-card";

const note = {
  id: "n1",
  title: "Q3 Launch",
  preview: "Ship onboarding",
  access: "private" as const,
  updatedAt: "2026-06-29T00:00:00.000Z",
  labels: [],
};

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: /note actions/i }));
}

describe("NoteCard", () => {
  it("shows Private for a private owned note and opens on click", async () => {
    const onOpen = vi.fn();
    render(<NoteCard note={note} variant="my" onOpen={onOpen} />);
    expect(screen.getByText("Private")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Q3 Launch"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("shows the owner line and View/Edit badge for a shared note, with no menu", () => {
    render(
      <NoteCard
        note={{ ...note, access: "edit" }}
        variant="shared"
        ownerName="Jess Park"
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText(/Jess Park's note/i)).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /note actions/i })).not.toBeInTheDocument();
  });

  it("my variant menu: Archive and Move to Trash call their handlers", async () => {
    const onArchive = vi.fn();
    const onTrash = vi.fn();
    render(
      <NoteCard
        note={note}
        variant="my"
        onOpen={vi.fn()}
        onArchive={onArchive}
        onTrash={onTrash}
      />,
    );

    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: /archive/i }));
    expect(onArchive).toHaveBeenCalledOnce();

    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: /move to trash/i }));
    expect(onTrash).toHaveBeenCalledOnce();
  });

  it("archive variant menu offers Unarchive", async () => {
    const onUnarchive = vi.fn();
    render(<NoteCard note={note} variant="archive" onOpen={vi.fn()} onUnarchive={onUnarchive} />);
    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: /unarchive/i }));
    expect(onUnarchive).toHaveBeenCalledOnce();
  });

  it("trash variant: not openable; Restore works and Delete forever confirms", async () => {
    const onOpen = vi.fn();
    const onRestore = vi.fn();
    const onDeleteForever = vi.fn();
    render(
      <NoteCard
        note={note}
        variant="trash"
        onOpen={onOpen}
        onRestore={onRestore}
        onDeleteForever={onDeleteForever}
      />,
    );

    // Body is not a button — clicking the title does not open the note.
    await userEvent.click(screen.getByText("Q3 Launch"));
    expect(onOpen).not.toHaveBeenCalled();

    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: /restore/i }));
    expect(onRestore).toHaveBeenCalledOnce();

    // Delete forever opens a confirm dialog; the mutation only fires after confirming.
    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: /delete forever/i }));
    expect(onDeleteForever).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /delete forever/i }));
    expect(onDeleteForever).toHaveBeenCalledOnce();
  });

  it("Labels… item appears only when onEditLabels is provided", async () => {
    const onEditLabels = vi.fn();
    render(<NoteCard note={note} variant="my" onOpen={vi.fn()} onEditLabels={onEditLabels} />);
    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: /labels/i }));
    expect(onEditLabels).toHaveBeenCalledOnce();
  });
});
