// One-off: add items.category column (db:push is broken — apply as raw SQL).
// Run from app/:  node --env-file=.env.local scripts/add-category-column.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS category text`;
  const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM information_schema.columns
    WHERE table_name = 'items' AND column_name = 'category'
  `;
  console.log(count === 1 ? "OK: items.category exists" : "FAIL: column missing");
} finally {
  await sql.end();
}
