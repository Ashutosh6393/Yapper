import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessControl } from "./access-control";

// The engine path is the one that was broken: it sets the level optimistically and never learns the
// capability token, so `url` stayed null and "Copy link" never rendered. The token now arrives on the
// note (pulled into Dexie, owner rows only) and the link is derived from it.
vi.mock("../../lib/sync/flag", () => ({ isSyncEngineEnabled: () => true }));
vi.mock("../../lib/sync/actions", () => ({ setShareLevel: vi.fn(), makePrivate: vi.fn() }));
vi.mock("../../lib/queries/notes", () => ({
  useShareNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMakePrivate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("AccessControl — copy link", () => {
  it("offers Copy link for a shared note whose token has arrived", () => {
    render(<AccessControl noteId="n1" access="edit" shareToken="tok_abc" />);

    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("offers Copy link at view level too", () => {
    render(<AccessControl noteId="n1" access="view" shareToken="tok_abc" />);

    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("shows no link for a private note, even if a stale token is still in the local row", () => {
    render(<AccessControl noteId="n1" access="private" shareToken="tok_abc" />);

    expect(screen.queryByRole("button", { name: /copy link/i })).toBeNull();
  });

  it("shows no link before the token has been pulled", () => {
    render(<AccessControl noteId="n1" access="edit" shareToken={null} />);

    expect(screen.queryByRole("button", { name: /copy link/i })).toBeNull();
  });
});
