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

  it("marks the active view with aria-current and navigates on click", async () => {
    const onSelectView = vi.fn();
    render(<Sidebar activeView="archive" onSelectView={onSelectView} onNewNote={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Archive" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "My Notes" })).not.toHaveAttribute("aria-current");

    await userEvent.click(screen.getByRole("button", { name: "Trash" }));
    expect(onSelectView).toHaveBeenCalledWith("trash");
  });

  it("highlights no tab when a label view is active", () => {
    render(<Sidebar activeView="my" labelActive onSelectView={vi.fn()} onNewNote={vi.fn()} />);
    expect(screen.getByRole("button", { name: "My Notes" })).not.toHaveAttribute("aria-current");
  });

  it("calls onClose when the mobile backdrop is tapped", async () => {
    const onClose = vi.fn();
    render(<Sidebar onNewNote={vi.fn()} open onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /close menu/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
