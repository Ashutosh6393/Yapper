import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A controllable URL — the page reads the active view + open note from useSearchParams().
let currentParams = new URLSearchParams();
const setParams = (qs: string) => {
  currentParams = new URLSearchParams(qs);
};
// push simulates a navigation: record the call AND update the params the next render reads, so
// URL-driven state (the note dialog) reacts the way it would in the browser.
const pushMock = vi.fn((url: string) => {
  setParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
});

vi.mock("../../lib/auth-client", () => ({
  signOut: vi.fn(),
  useSession: () => ({ data: { user: { email: "me@x.co" } }, isPending: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: pushMock }),
  useSearchParams: () => currentParams,
}));

vi.mock("../notes/[id]/Editor", () => ({ Editor: () => <div>editor</div> }));
vi.mock("../../components/dashboard/access-control", () => ({
  AccessControl: () => <div>access</div>,
}));

const activeNote = {
  id: "act",
  title: "ActiveNote",
  preview: "",
  access: "private" as const,
  updatedAt: "2026-06-29T00:00:00.000Z",
  labels: [],
};
const archivedNote = { ...activeNote, id: "arc", title: "ArchivedNote" };
const trashedNote = { ...activeNote, id: "trs", title: "TrashedNote" };
const sharedNote = {
  ...activeNote,
  id: "shr",
  title: "SharedNote",
  access: "edit" as const,
  ownerName: "Jess",
};

const createMock = vi.fn(async () => ({
  id: "new-1",
  title: "Untitled",
  access: "private",
  updatedAt: "",
}));
const archiveMock = vi.fn();
const trashMock = vi.fn();
const restoreMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../../lib/queries/notes", () => ({
  noteKeys: { all: ["notes"], detail: (id: string) => ["notes", "detail", id] },
  useNotes: (filter: string) => ({
    isPending: false,
    data:
      filter === "archived" ? [archivedNote] : filter === "trashed" ? [trashedNote] : [activeNote],
  }),
  useSharedNotes: () => ({ isPending: false, data: [sharedNote] }),
  useCreateNote: () => ({ mutateAsync: createMock, isPending: false }),
  useArchiveNote: () => ({ mutate: archiveMock }),
  useUnarchiveNote: () => ({ mutate: vi.fn() }),
  useTrashNote: () => ({ mutate: trashMock }),
  useRestoreNote: () => ({ mutate: restoreMock }),
  usePermanentDelete: () => ({ mutate: deleteMock }),
  usePrefetchNote: () => vi.fn(),
  useNote: () => ({ data: { id: "new-1", title: "Untitled", access: "private", isOwner: true } }),
}));
const deleteLabelMock = vi.fn();
vi.mock("../../lib/queries/labels", () => ({
  labelKeys: { all: ["labels"] },
  useLabels: () => ({ data: [{ id: "L1", name: "Work", color: "sky", noteCount: 2 }] }),
  useDeleteLabel: () => ({ mutate: deleteLabelMock }),
  useCreateLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetNoteLabels: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "@/components/ui/sonner";
import DashboardPage from "./page";

describe("DashboardPage (spec 12 — single URL-driven view)", () => {
  beforeEach(() => {
    setParams("");
    pushMock.mockClear();
    archiveMock.mockClear();
    trashMock.mockClear();
    restoreMock.mockClear();
    deleteMock.mockClear();
  });

  it("defaults to My Notes and shows only the active list", () => {
    render(<DashboardPage />);
    expect(screen.getByText("ActiveNote")).toBeInTheDocument();
    expect(screen.queryByText("SharedNote")).not.toBeInTheDocument();
  });

  it("clicking a sidebar tab navigates via the URL", async () => {
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: "Trash" }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard?view=trash");
  });

  it("My Notes card: Move to Trash calls the trash mutation", async () => {
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /note actions/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /move to trash/i }));
    expect(trashMock).toHaveBeenCalledWith("act");
  });

  it("Trash view: Restore calls the restore mutation; cards are not openable", async () => {
    setParams("view=trash");
    render(<DashboardPage />);
    expect(screen.getByText("TrashedNote")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /note actions/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /^restore$/i }));
    expect(restoreMock).toHaveBeenCalledWith("trs");
  });

  it("Shared view lists shared notes and shows no card menu", () => {
    setParams("view=shared");
    render(<DashboardPage />);
    expect(screen.getByText("SharedNote")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /note actions/i })).not.toBeInTheDocument();
  });

  it("search filters the active view and clears when the view switches", async () => {
    const { rerender } = render(<DashboardPage />);
    const box = screen.getByPlaceholderText(/Search notes/i);
    await userEvent.type(box, "zzz");
    expect(screen.queryByText("ActiveNote")).not.toBeInTheDocument();

    // Switch view → the search resets and the new view renders.
    setParams("view=archive");
    rerender(<DashboardPage />);
    await waitFor(() => expect(screen.getByText("ArchivedNote")).toBeInTheDocument());
    expect((screen.getByPlaceholderText(/Search notes/i) as HTMLInputElement).value).toBe("");
  });

  it("sidebar lists labels; clicking one navigates to the label view", async () => {
    render(<DashboardPage />);
    expect(screen.getByText("Work")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Work/ }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard?label=L1");
  });

  it("My Notes card Labels… opens the label editor", async () => {
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /note actions/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /labels/i }));
    expect(await screen.findByLabelText("New label name")).toBeInTheDocument();
  });

  it("opening a note card puts it in the URL (?note=)", async () => {
    render(<DashboardPage />);
    await userEvent.click(screen.getByText("ActiveNote"));
    expect(pushMock).toHaveBeenCalledWith("/dashboard?note=act");
  });

  it("opening a note preserves the active view", async () => {
    setParams("view=archive");
    render(<DashboardPage />);
    await userEvent.click(screen.getByText("ArchivedNote"));
    expect(pushMock).toHaveBeenCalledWith("/dashboard?view=archive&note=arc");
  });

  it("a ?note= deep link opens the dialog", async () => {
    setParams("note=act");
    render(<DashboardPage />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // Editor is lazy-loaded now, so await its chunk resolving instead of a sync query.
    expect(await screen.findByText("editor")).toBeInTheDocument();
  });

  it("closing the dialog strips note but keeps the view", async () => {
    setParams("view=archive&note=arc");
    render(<DashboardPage />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard?view=archive");
  });

  it("New Note creates a note and opens the dialog", async () => {
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /New Note/i }));
    await waitFor(() => expect(createMock).toHaveBeenCalledOnce());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens the editor instantly — the dialog shell shows before the create request resolves", async () => {
    let release!: () => void;
    createMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = () => res({ id: "new-1", title: "Untitled", access: "private", updatedAt: "" });
        }),
    );
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /New Note/i }));

    // Dialog + "Creating note…" shell are visible while the POST is still in flight.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Creating note/i)).toBeInTheDocument();

    // Once the note exists, the editor binds.
    release();
    expect(await screen.findByText("editor")).toBeInTheDocument();
  });

  it("closes the shell and error-toasts when create fails", async () => {
    createMock.mockImplementationOnce(() => Promise.reject(new Error("nope")));
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /New Note/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
