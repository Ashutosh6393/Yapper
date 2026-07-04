import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNotes } from "./notes";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function mockFetchJson(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("useNotes", () => {
  it("fetches and parses the notes list", async () => {
    const rows = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Alpha",
        preview: "",
        access: "private",
        updatedAt: "2026-06-29T00:00:00.000Z",
        labels: [],
      },
    ];
    mockFetchJson(rows);

    const { result } = renderHook(() => useNotes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);
  });

  it("surfaces a schema-parse failure as a query error", async () => {
    mockFetchJson([{ id: "missing-fields" }]);

    const { result } = renderHook(() => useNotes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
