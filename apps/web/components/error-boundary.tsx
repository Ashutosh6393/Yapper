"use client";

import { Component, type ReactNode } from "react";
import { reportError } from "../lib/report-error";

/**
 * The only component-level boundary in the app (spec 25c, ADR-006). React exposes this as a class
 * component or not at all, and that is the entire reason this file exists — 25 lines instead of the
 * `react-error-boundary` dependency, whose one feature we'd want (`resetKeys`) we get for free by putting
 * a `key` on the boundary: React remounts it when the key changes and the error state resets itself.
 *
 * Placement is the design. A boundary belongs where there is a **meaningful recovery**, not wherever
 * there is a component — wrapping every note card would render a broken card inside a working list that
 * nobody notices, which is worse than crashing loudly. The note dialog has a recovery (close it), and it
 * holds the crashiest code in the repo (TipTap + Yjs + Hocuspocus) mounted inside the app's most valuable
 * surface.
 *
 * Catches **render throws only** — not event handlers, not async, not promise rejections, not TanStack
 * Query errors (Query returns errors as state). Those reach `reportError` through the other seams.
 */
interface Props {
  children: ReactNode;
  /** Receives the error so it can pick a recovery — `isChunkError` → reload, otherwise close/retry. */
  fallback: (error: unknown) => ReactNode;
}

interface State {
  error: unknown;
  crashed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, crashed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, crashed: true };
  }

  override componentDidCatch(error: unknown) {
    // A render crash reaches no other seam — without this it is a white screen and silence.
    reportError(error);
  }

  override render() {
    return this.state.crashed ? this.props.fallback(this.state.error) : this.props.children;
  }
}
