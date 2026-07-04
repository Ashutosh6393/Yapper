import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const setNoteLabelsMock = vi.fn(async (_arg: { noteId: string; labelIds: string[] }) => {});
const createLabelMock = vi.fn(async (_arg: { name: string; color: string }) => ({
  id: "new",
  name: "Urgent",
  color: "amber",
  noteCount: 0,
}));

vi.mock("@/lib/queries/labels", () => ({
  useLabels: () => ({
    data: [
      { id: "L1", name: "Work", color: "sky", noteCount: 1 },
      { id: "L2", name: "Home", color: "rose", noteCount: 0 },
    ],
  }),
  useCreateLabel: () => ({ mutateAsync: createLabelMock, isPending: false }),
  useSetNoteLabels: () => ({ mutateAsync: setNoteLabelsMock, isPending: false }),
}));

import { LabelEditor } from "./label-editor";

describe("LabelEditor", () => {
  it("pre-checks attached labels; toggling + Save replaces the note's set", async () => {
    const onClose = vi.fn();
    render(<LabelEditor noteId="n1" attachedIds={["L1"]} open onClose={onClose} />);

    expect(screen.getByRole("checkbox", { name: "Work" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Home" })).not.toBeChecked();

    await userEvent.click(screen.getByRole("checkbox", { name: "Home" }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(setNoteLabelsMock).toHaveBeenCalledOnce();
    const call = setNoteLabelsMock.mock.calls[0];
    if (!call) throw new Error("expected setNoteLabels to have been called");
    expect(call[0].noteId).toBe("n1");
    expect([...call[0].labelIds].sort()).toEqual(["L1", "L2"]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("inline-create makes a label and includes it in the saved set", async () => {
    render(<LabelEditor noteId="n1" attachedIds={[]} open onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("New label name"), "Urgent");
    await userEvent.click(screen.getByRole("button", { name: "Color amber" }));
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(createLabelMock).toHaveBeenCalledWith({ name: "Urgent", color: "amber" });

    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    const lastCall = setNoteLabelsMock.mock.calls.at(-1);
    if (!lastCall) throw new Error("expected setNoteLabels to have been called");
    expect(lastCall[0].labelIds).toContain("new");
  });
});
