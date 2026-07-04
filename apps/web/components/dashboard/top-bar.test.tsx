import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", setTheme: vi.fn() }) }));

import { TopBar } from "./top-bar";

const base = {
  search: "",
  onSearch: vi.fn(),
  onRefresh: vi.fn(),
  email: "a@b.c",
  onSignOut: vi.fn(),
};

describe("TopBar", () => {
  it("types into search and triggers refresh", async () => {
    const onSearch = vi.fn();
    const onRefresh = vi.fn();
    render(<TopBar {...base} onSearch={onSearch} onRefresh={onRefresh} />);

    await userEvent.type(screen.getByPlaceholderText(/Search notes/i), "q");
    expect(onSearch).toHaveBeenCalledWith("q");

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("opens the avatar menu showing the email and sign out", async () => {
    const onSignOut = vi.fn();
    render(<TopBar {...base} onSignOut={onSignOut} />);

    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(await screen.findByText("a@b.c")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("calls onMenuClick when the hamburger is clicked", async () => {
    const onMenuClick = vi.fn();
    render(<TopBar {...base} onMenuClick={onMenuClick} />);
    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    expect(onMenuClick).toHaveBeenCalledOnce();
  });

  it("spins the refresh icon only while refreshing", () => {
    const { rerender } = render(<TopBar {...base} refreshing={false} />);
    const idle = screen.getByRole("button", { name: /refresh notes/i }).querySelector("svg");
    expect(idle?.classList.contains("animate-spin")).toBe(false);

    rerender(<TopBar {...base} refreshing={true} />);
    const spinning = screen.getByRole("button", { name: /refresh notes/i }).querySelector("svg");
    expect(spinning?.classList.contains("animate-spin")).toBe(true);
  });

  it("disables the refresh button while refreshing", () => {
    render(<TopBar {...base} refreshing={true} />);
    expect(screen.getByRole("button", { name: /refresh notes/i })).toBeDisabled();
  });
});
