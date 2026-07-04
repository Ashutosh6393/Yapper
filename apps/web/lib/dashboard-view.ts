import type { ReadonlyURLSearchParams } from "next/navigation";

/** The dashboard shows exactly one view at a time (ADR-006). The four sidebar tabs, plus a
 * per-label filtered view reached via `?label=<id>` (which is a filtered "my notes"). */
export type DashboardView = "my" | "shared" | "archive" | "trash";

/** Lifecycle filter passed to `GET /api/notes` for a given view. */
export type NoteFilter = "active" | "archived" | "trashed";

export interface ActiveView {
  view: DashboardView;
  /** Non-null only for a label-filtered view (implies `view: "my"`). */
  labelId: string | null;
}

/** Derive the active view from the URL query. Default (no params) is My Notes. A `label` param
 * takes precedence and pins the base view to `my` (owned active notes carrying that label). */
export function readActiveView(params: URLSearchParams | ReadonlyURLSearchParams): ActiveView {
  const labelId = params.get("label");
  if (labelId) return { view: "my", labelId };
  const v = params.get("view");
  const view: DashboardView = v === "shared" || v === "archive" || v === "trash" ? v : "my";
  return { view, labelId: null };
}

/** The `GET /api/notes` filter for a view (irrelevant for `shared`, which has its own endpoint). */
export function filterForView(view: DashboardView): NoteFilter {
  if (view === "archive") return "archived";
  if (view === "trash") return "trashed";
  return "active";
}

/** Build the dashboard URL query string for a base view (clears any label filter). */
export function viewQuery(view: DashboardView): string {
  return view === "my" ? "/dashboard" : `/dashboard?view=${view}`;
}

/** Build the dashboard URL query string for a label-filtered view. */
export function labelQuery(labelId: string): string {
  return `/dashboard?label=${labelId}`;
}
