// One-off: seller v1 columns — sale currency + payment defaults on listings;
// UPI, draft flag, seller note and raw AI draft on items. Additive only: every
// column is nullable or defaulted, so existing sales stay USD with no backfill
// (db:push is broken — apply as raw SQL). Run from app/:
//   node --env-file=.env.local scripts/add-seller-v1-columns.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

const EXPECTED = [
  ["listings", "currency"],
  ["listings", "default_venmo_handle"],
  ["listings", "default_upi_id"],
  ["items", "upi_id"],
  ["items", "draft"],
  ["items", "seller_note"],
  ["items", "ai_draft"],
];

try {
  await sql.begin(async (tx) => {
    await tx`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
        ADD COLUMN IF NOT EXISTS default_venmo_handle text,
        ADD COLUMN IF NOT EXISTS default_upi_id text
    `;
    await tx`
      ALTER TABLE listings
        DROP CONSTRAINT IF EXISTS listings_currency_check,
        ADD CONSTRAINT listings_currency_check CHECK (currency IN ('USD', 'INR'))
    `;
    await tx`
      ALTER TABLE items
        ADD COLUMN IF NOT EXISTS upi_id text,
        ADD COLUMN IF NOT EXISTS draft boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS seller_note text,
        ADD COLUMN IF NOT EXISTS ai_draft jsonb
    `;
  });

  const rows = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_name IN ('listings', 'items')
  `;
  const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = EXPECTED.filter(([t, c]) => !have.has(`${t}.${c}`));
  const [{ usd, total }] = await sql`
    SELECT count(*) FILTER (WHERE currency = 'USD')::int AS usd,
           count(*)::int AS total
    FROM listings
  `;
  console.log(
    missing.length === 0
      ? `OK: ${EXPECTED.length} columns exist; ${usd}/${total} listings USD`
      : `FAIL: missing ${missing.map((m) => m.join(".")).join(", ")}`,
  );
} finally {
  await sql.end();
}
