import { drizzle } from "drizzle-orm/d1";
import { getDatabaseAdapter } from "./sqlite.mjs";
import * as schema from "./schema";

export function getDb() {
  // The Node adapter implements the query surface expected by Drizzle's async
  // SQLite driver; all data is stored in the local journal.sqlite file.
  return drizzle(getDatabaseAdapter() as Parameters<typeof drizzle>[0], { schema });
}
