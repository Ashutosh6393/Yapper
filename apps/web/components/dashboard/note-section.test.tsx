import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteSection } from "./note-section";

const notes = [
  {
    id: "a",
    title: "Alpha",
    preview: "",
    access: "private" as const,
    updatedAt: "2026-06-29T00:00:00.000Z",
  },
  {
    id: "b",
    title: "Beta",
    preview: "",
    access: "view" as const,
    updatedAt: "2026-06-29T00:00:00.000Z",
  },
];

describe("NoteSection", () => {
  it("renders the label, count and a card per note", () => {
    render(
      <NoteSection
        label="My Notes"
        loading={false}
        notes={notes}
        emptyText="No notes"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("My Notes")).toBeInTheDocument();
    expect(screen.getByText("2 notes")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("renders the empty text when there are no notes", () => {
    render(
      <NoteSection
        label="Shared with Me"
        loading={false}
        notes={[]}
        emptyText="Nothing shared"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Nothing shared")).toBeInTheDocument();
  });
});
