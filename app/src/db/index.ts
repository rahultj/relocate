// Drizzle client over postgres-js. Server-only — never import from client components.
//
// Uses Supabase's connection string from DATABASE_URL. The transaction pooler
// (port 6543) is fine for serverless query traffic; migrations use the session
// pooler via drizzle-kit (see drizzle.config.ts).

import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env.local.");
}

// `prepare: false` is required for Supabase's transaction-mode pooler (PgBouncer).
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema, casing: "snake_case" });

export { schema };
