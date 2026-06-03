import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Next.js keeps secrets in .env.local; load it (falling back to .env) so
// drizzle-kit sees DATABASE_URL the same way the app does.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
