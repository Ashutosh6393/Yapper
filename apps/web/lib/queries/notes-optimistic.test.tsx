import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { NoteSummary } from "@yapper/schemas";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@/components/ui/sonner";
import { noteKeys, useTrashNote } from "./notes";

const noteA: NoteSummary = {
  id: "a",
  title: "A",
  preview: "",
  access: "private",
  updatedAt: "2026-06-29T00:00:00.000Z",
  labels: [],
};
const noteB: NoteSummary = { ...noteA, id: "b", title: "B" };

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(noteKeys.list("active", null), [noteA, noteB]);
  qc.setQueryData(noteKeys.list("active", "label-1"), [noteA]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useTrashNote (optimistic)", () => {
  it("removes the note from every cached list slice before the request settles", async () => {
    const { qc, wrapper } = setup();
    // Gate the request so it stays in flight while we assert the optimistic removal, then release
    // it (avoids a dangling pending mutation). onSettled has no observers here → no refetch.
    let release!: () => void;
    const gate = new Promise<Response>((res) => {
      release = () => res(new Response(null, { status: 204 }));
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => gate),
    );

    const { result } = renderHook(() => useTrashNote(), { wrapper });
    result.current.mutate(noteA.id);

    await waitFor(() => {
      expect(qc.getQueryData(noteKeys.list("active", null))).toEqual([noteB]);
      expect(qc.getQueryData(noteKeys.list("active", "label-1"))).toEqual([]);
    });
    release();
  });

  it("rolls back every slice and error-toasts when the request fails", async () => {
    const { qc, wrapper } = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    const { result } = renderHook(() => useTrashNote(), { wrapper });
    result.current.mutate(noteA.id);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(qc.getQueryData(noteKeys.list("active", null))).toEqual([noteA, noteB]);
    expect(qc.getQueryData(noteKeys.list("active", "label-1"))).toEqual([noteA]);
  });

  it("shows a Moved to Trash toast whose Undo restores the note", async () => {
    const { wrapper } = setup();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${_url}`);
        return new Response(null, { status: 204 });
      }),
    );

    const { result } = renderHook(() => useTrashNote(), { wrapper });
    result.current.mutate(noteA.id);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const lastCall = vi.mocked(toast.success).mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("Moved to Trash");
    const opts = lastCall?.[1] as { action?: { label: string; onClick: () => void } } | undefined;
    expect(opts?.action?.label).toBe("Undo");

    opts?.action?.onClick();
    await waitFor(() => expect(calls.some((c) => c.includes("/restore"))).toBe(true));
  });
});
