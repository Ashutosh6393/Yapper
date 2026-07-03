import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/auth-client", () => ({
  signOut: vi.fn(),
  useSession: () => ({ data: { user: { email: "me@x.co" } }, isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

// Editor/ShareDialog reach the network — stub them out of the page tree.
vi.mock("../notes/[id]/Editor", () => ({ Editor: () => <div>editor</div> }));
vi.mock("../notes/[id]/ShareDialog", () => ({ ShareDialog: () => <div>share</div> }));

const createMock = vi.fn(async () => ({
  id: "new-1",
  title: "Untitled",
  access: "private",
  updatedAt: "",
}));
const deleteMock = vi.fn();
const invalidateMock = vi.fn();
vi.mock("../../lib/queries/notes", () => ({
  noteKeys: { all: ["notes"] },
  useNotes: () => ({
    isPending: false,
    data: [
      {
        id: "a",
        title: "Alpha",
        preview: "first",
        access: "private",
        updatedAt: "2026-06-29T00:00:00.000Z",
      },
      {
        id: "b",
        title: "Beta",
        preview: "second",
        access: "view",
        updatedAt: "2026-06-29T00:00:00.000Z",
      },
    ],
  }),
  useSharedNotes: () => ({
    isPending: false,
    data: [
      {
        id: "s",
        title: "Gamma",
        preview: "shared",
        access: "edit",
        ownerName: "Jess",
        updatedAt: "2026-06-29T00:00:00.000Z",
      },
    ],
  }),
  useCreateNote: () => ({ mutateAsync: createMock, isPending: false }),
  useDeleteNote: () => ({ mutate: deleteMock }),
  useNote: () => ({ data: { id: "new-1", title: "Untitled", access: "private", isOwner: true } }),
}));
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: invalidateMock }),
}));

import DashboardPage from "./page";

describe("DashboardPage (spec 11 goal state)", () => {
  beforeEach(() => {
    createMock.mockClear();
    deleteMock.mockClear();
    invalidateMock.mockClear();
  });

  it("renders My Notes and Shared with Me from query data", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.getByText(/Jess's note/i)).toBeInTheDocument();
  });

  it("filters both sections by the search query", async () => {
    render(<DashboardPage />);
    await userEvent.type(screen.getByPlaceholderText(/Search notes/i), "alpha");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamma")).not.toBeInTheDocument();
  });

  it("refresh invalidates the notes queries", async () => {
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(invalidateMock).toHaveBeenCalledWith({ queryKey: ["notes"] });
  });

  it("New Note creates a note and opens the dialog", async () => {
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /New Note/i }));
    await waitFor(() => expect(createMock).toHaveBeenCalledOnce());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
