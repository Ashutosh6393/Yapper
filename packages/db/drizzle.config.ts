import { defineConfig } from "drizzle-kit";

// drizzle-kit is a dev tool; `db:generate` only reads the schema file, so a placeholder URL
// keeps it working without a DB. Runtime app code (client.ts) requires DATABASE_URL strictly.
const url = process.env.DATABASE_URL ?? "postgres://yapper:yapper@localhost:5432/yapper";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
