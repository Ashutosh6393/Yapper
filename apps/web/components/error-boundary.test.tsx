import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./error-boundary";

vi.mock("../lib/report-error", () => ({ reportError: vi.fn() }));

import { reportError } from "../lib/report-error";

function Boom(): React.ReactNode {
  throw new TypeError("Cannot read properties of undefined (reading 'title')");
}

beforeEach(() => {
  // React logs every error a boundary catches, unconditionally. Not a failure — just noise.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

/**
 * The thesis of the whole placement decision (spec 25c, ADR-006): a crash in the editor costs the *note*,
 * not the app. If this assertion ever flips, the boundary is in the wrong place and a TipTap throw takes
 * the dashboard, the note list and the sync engine down with it.
 */
it("contains the crash: the fallback renders and the surrounding app stays mounted", () => {
  render(
    <div>
      <p>dashboard</p>
      <ErrorBoundary fallback={() => <p>This note failed to open</p>}>
        <Boom />
      </ErrorBoundary>
    </div>,
  );

  expect(screen.getByText("This note failed to open")).toBeInTheDocument();
  expect(screen.getByText("dashboard")).toBeInTheDocument(); // the app survived
});

it("reports the crash through the one seam (render throws reach nothing else)", () => {
  render(
    <ErrorBoundary fallback={() => <p>failed</p>}>
      <Boom />
    </ErrorBoundary>,
  );

  expect(reportError).toHaveBeenCalledTimes(1);
  expect(vi.mocked(reportError).mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
});

it("hands the error to the fallback so it can choose a recovery (reload vs close)", () => {
  render(
    <ErrorBoundary fallback={(err) => <p>caught: {(err as Error).name}</p>}>
      <Boom />
    </ErrorBoundary>,
  );

  expect(screen.getByText("caught: TypeError")).toBeInTheDocument();
});

it("renders children untouched when nothing throws", () => {
  render(
    <ErrorBoundary fallback={() => <p>failed</p>}>
      <p>the editor</p>
    </ErrorBoundary>,
  );

  expect(screen.getByText("the editor")).toBeInTheDocument();
  expect(reportError).not.toHaveBeenCalled();
});
