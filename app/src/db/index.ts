// Drizzle client over postgres-js. Server-only — never import from client components.
//
// Uses Supabase's connection string from DATABASE_URL. The transaction pooler
// (port 6543) is fine for serverless query traffic; migrations use the session
// pooler via drizzle-kit (see drizzle.config.ts).
//
// The connection is created lazily on first query, not at import time, so a
// surface that imports `db` but doesn't query it (e.g. /seller/add rendering
// its form) still works before DATABASE_URL is configured.

import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

let _db: DB | null = null;

function getDb(): DB {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env.local.");
  }
  // `prepare: false` is required for Supabase's transaction-mode pooler (PgBouncer).
  const client = postgres(connectionString, { prepare: false });
  _db = drizzle(client, { schema, casing: "snake_case" });
  return _db;
}

// Proxy so `db.query…` / `db.transaction…` resolve the real client on first use.
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
