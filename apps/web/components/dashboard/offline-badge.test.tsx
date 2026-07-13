import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineBadge } from "./offline-badge";

/** Drive `navigator.onLine` + the events the browser fires alongside it. */
function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OfflineBadge", () => {
  it("renders nothing while online", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineBadge />);

    expect(screen.queryByText(/offline/i)).toBeNull();
  });

  it("tells the user their work is safe while offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineBadge />);

    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    // The badge's whole job: the queue is already durable, so say so — an unlabelled offline state
    // reads as data loss. `role="status"` is a live region: screen readers announce its *contents*, so
    // the reassurance has to be in the badge itself, not only in a hover-only tooltip.
    expect(screen.getByRole("status")).toHaveTextContent(/saved on this device/i);
  });

  it("appears and disappears as connectivity changes", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineBadge />);
    expect(screen.queryByRole("status")).toBeNull();

    setOnline(false);
    expect(screen.getByRole("status")).toBeInTheDocument();

    setOnline(true);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
