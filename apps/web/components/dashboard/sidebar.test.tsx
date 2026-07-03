import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

describe("Sidebar", () => {
  it("renders nav items and calls onNewNote when New Note is clicked", async () => {
    const onNewNote = vi.fn();
    render(<Sidebar onNewNote={onNewNote} />);

    expect(screen.getByText("My Notes")).toBeInTheDocument();
    expect(screen.getByText("Shared with Me")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("Trash")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /New Note/i }));
    expect(onNewNote).toHaveBeenCalledOnce();
  });
});
