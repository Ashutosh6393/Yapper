import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Workspace package exports raw .ts (no build step); point Vitest at the source.
      {
        find: "@yapper/schemas",
        replacement: fileURLToPath(new URL("../../packages/schemas/src/index.ts", import.meta.url)),
      },
      // Mirror tsconfig's `@/*` → `./*` app-root alias so tests can import shadcn/ui + lib modules.
      { find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
