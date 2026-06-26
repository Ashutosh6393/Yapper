export { type Database, db, pool } from "./client";

// Named exports for tables, enums, and inferred row types.
export * from "./schema";

// Namespaced access: `import { schema } from "@yapper/db"` → `schema.note`, etc.
export * as schema from "./schema";
