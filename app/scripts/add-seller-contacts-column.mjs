// One-off: add listings.seller_contacts jsonb column + backfill the real
// listing's contacts (db:push is broken — apply as raw SQL).
// Run from app/:  node --env-file=.env.local scripts/add-seller-contacts-column.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

// The real listing keeps its current buyer-facing contacts (was hardcoded in
// lib/seller-contact.ts, now removed). Swati is primary.
const RAHUL_LISTING = "262da553-11ec-4414-986a-01c9f86dcdc6";
const RAHUL_CONTACTS = [
  { name: "Swati", value: "+16172307788", primary: true },
  { name: "Rahul", value: "+18572069533" },
];

try {
  await sql`
    ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS seller_contacts jsonb NOT NULL DEFAULT '[]'::jsonb
  `;
  const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'seller_contacts'
  `;
  console.log(count === 1 ? "OK: listings.seller_contacts exists" : "FAIL: column missing");

  const updated = await sql`
    UPDATE listings
    SET seller_contacts = ${sql.json(RAHUL_CONTACTS)}
    WHERE id = ${RAHUL_LISTING}
    RETURNING slug
  `;
  console.log(
    updated.length === 1
      ? `OK: backfilled contacts on /r/${updated[0].slug}`
      : `WARN: real listing ${RAHUL_LISTING} not found (backfill skipped)`,
  );
} finally {
  await sql.end();
}
