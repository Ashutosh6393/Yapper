import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LabelChips } from "./label-chip";

const mk = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `l${i}`, name: `Label${i}`, color: "sky" as const }));

describe("LabelChips", () => {
  it("renders nothing for an empty set", () => {
    const { container } = render(<LabelChips labels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each label chip when 3 or fewer", () => {
    render(<LabelChips labels={mk(3)} />);
    expect(screen.getByText("Label0")).toBeInTheDocument();
    expect(screen.getByText("Label2")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("caps at 3 chips and shows a +N overflow", () => {
    render(<LabelChips labels={mk(5)} />);
    expect(screen.getByText("Label0")).toBeInTheDocument();
    expect(screen.getByText("Label2")).toBeInTheDocument();
    expect(screen.queryByText("Label3")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});
