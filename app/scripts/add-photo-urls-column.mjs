// One-off: add items.photo_urls text[] + backfill from the existing single
// photo_url (db:push is broken — apply as raw SQL). Run from app/:
//   node --env-file=.env.local scripts/add-photo-urls-column.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  await sql`
    ALTER TABLE items
    ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}'
  `;
  // Backfill: existing single photo becomes the first (cover) entry.
  const res = await sql`
    UPDATE items
    SET photo_urls = ARRAY[photo_url]
    WHERE photo_url IS NOT NULL
      AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL)
  `;
  const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM information_schema.columns
    WHERE table_name = 'items' AND column_name = 'photo_urls'
  `;
  console.log(
    count === 1
      ? `OK: items.photo_urls exists; backfilled ${res.count} rows`
      : "FAIL: column missing",
  );
} finally {
  await sql.end();
}
