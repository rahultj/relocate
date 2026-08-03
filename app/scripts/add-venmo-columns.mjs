// One-off: add items.venmo_handle + items.venmo_link (db:push is broken — apply
// as raw SQL). Run from app/:
//   node --env-file=.env.local scripts/add-venmo-columns.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  await sql`
    ALTER TABLE items
    ADD COLUMN IF NOT EXISTS venmo_handle text,
    ADD COLUMN IF NOT EXISTS venmo_link text
  `;
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'items' AND column_name IN ('venmo_handle', 'venmo_link')
    ORDER BY column_name
  `;
  console.log(
    cols.length === 2
      ? "OK: items.venmo_handle + items.venmo_link exist"
      : `FAIL: expected 2 columns, found ${cols.length}`,
  );
} finally {
  await sql.end();
}
