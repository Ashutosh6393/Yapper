import { defineConfig } from "drizzle-kit";

// drizzle-kit is a dev tool; fall back to the docker-compose default so `db:generate`
// works without a running DB. Runtime app code (client.ts) requires DATABASE_URL strictly.
const url = process.env.DATABASE_URL ?? "postgres://yapper:yapper@localhost:5432/yapper";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
