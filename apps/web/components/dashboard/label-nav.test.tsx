import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LabelNav } from "./label-nav";

const labels = [
  { id: "L1", name: "Work", color: "sky" as const, noteCount: 2 },
  { id: "L2", name: "Personal", color: "rose" as const, noteCount: 0 },
];

describe("LabelNav", () => {
  it("renders nothing when there are no labels", () => {
    const { container } = render(<LabelNav labels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists labels with their counts and navigates on click", async () => {
    const onSelectLabel = vi.fn();
    render(<LabelNav labels={labels} onSelectLabel={onSelectLabel} />);

    expect(screen.getByText("Labels")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    // The count is rendered alongside the name.
    expect(screen.getByRole("button", { name: /^Work/ })).toHaveTextContent("2");

    await userEvent.click(screen.getByRole("button", { name: /^Work/ }));
    expect(onSelectLabel).toHaveBeenCalledWith("L1");
  });

  it("delete confirms before calling onDeleteLabel", async () => {
    const onDeleteLabel = vi.fn();
    render(<LabelNav labels={labels} onDeleteLabel={onDeleteLabel} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete label Work" }));
    // Nothing deleted yet — a confirm dialog appears.
    expect(onDeleteLabel).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(onDeleteLabel).toHaveBeenCalledWith("L1");
  });
});
