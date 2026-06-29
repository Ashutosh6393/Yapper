"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getQueryClient } from "../lib/query-client";

/** App-wide client providers. Currently TanStack Query; Zustand stores are hook-based and need no provider. */
export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
