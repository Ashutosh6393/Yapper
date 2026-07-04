import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { Label, NoteSummary } from "@yapper/schemas";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { labelKeys, useCreateLabel, useDeleteLabel, useSetNoteLabels } from "./labels";
import { noteKeys } from "./notes";

const work: Label = { id: "lw", name: "Work", color: "sky", noteCount: 1 };
const home: Label = { id: "lh", name: "Home", color: "rose", noteCount: 0 };

const noteWithWork: NoteSummary = {
  id: "n1",
  title: "N1",
  preview: "",
  access: "private",
  updatedAt: "2026-06-29T00:00:00.000Z",
  labels: [{ id: "lw", name: "Work", color: "sky" }],
};
const noteNoLabels: NoteSummary = { ...noteWithWork, id: "n2", labels: [] };

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function newQc() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** A fetch stub whose single request stays in flight until `release()` — lets us assert the
 * optimistic cache state before the mutation settles. */
function gatedFetch() {
  let release!: () => void;
  const gate = new Promise<Response>((res) => {
    release = () => res(new Response(JSON.stringify(home), { status: 200 }));
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => gate),
  );
  return () => release();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("label mutations (optimistic)", () => {
  it("useCreateLabel appends the new label before the request settles", async () => {
    const qc = newQc();
    qc.setQueryData(labelKeys.all, [work]);
    const release = gatedFetch();

    const { result } = renderHook(() => useCreateLabel(), { wrapper: wrapperFor(qc) });
    result.current.mutate({ name: "Personal", color: "amber" });

    await waitFor(() => {
      const labels = qc.getQueryData<Label[]>(labelKeys.all) ?? [];
      expect(labels.some((l) => l.name === "Personal")).toBe(true);
    });
    release();
  });

  it("useDeleteLabel removes the label and strips it from cached note chips", async () => {
    const qc = newQc();
    qc.setQueryData(labelKeys.all, [work, home]);
    qc.setQueryData(noteKeys.list("active", null), [noteWithWork]);
    const release = gatedFetch();

    const { result } = renderHook(() => useDeleteLabel(), { wrapper: wrapperFor(qc) });
    result.current.mutate(work.id);

    await waitFor(() => {
      const labels = qc.getQueryData<Label[]>(labelKeys.all) ?? [];
      expect(labels.find((l) => l.id === work.id)).toBeUndefined();
      const notes = qc.getQueryData<NoteSummary[]>(noteKeys.list("active", null)) ?? [];
      expect(notes[0]?.labels.some((c) => c.id === work.id)).toBe(false);
    });
    release();
  });

  it("useSetNoteLabels rewrites a note's chips from the labels cache", async () => {
    const qc = newQc();
    qc.setQueryData(labelKeys.all, [work, home]);
    qc.setQueryData(noteKeys.list("active", null), [noteNoLabels]);
    const release = gatedFetch();

    const { result } = renderHook(() => useSetNoteLabels(), { wrapper: wrapperFor(qc) });
    result.current.mutate({ noteId: noteNoLabels.id, labelIds: [work.id] });

    await waitFor(() => {
      const notes = qc.getQueryData<NoteSummary[]>(noteKeys.list("active", null)) ?? [];
      expect(notes[0]?.labels.map((c) => c.id)).toEqual([work.id]);
    });
    release();
  });
});
