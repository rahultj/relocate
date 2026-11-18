// One-off: add claims.promoted_at (waitlist auto-promotion's "Promoted · reach
// out" tag; db:push is broken, so apply as raw SQL). Nullable, no default:
// existing rows are untouched. Run from app/:
//   node --env-file=.env.local scripts/add-claims-promoted-at.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  await sql`ALTER TABLE claims ADD COLUMN IF NOT EXISTS promoted_at timestamptz`;
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'claims' AND column_name = 'promoted_at'
  `;
  console.log(cols.length === 1 ? "OK: claims.promoted_at exists" : "FAIL: claims.promoted_at missing");
} finally {
  await sql.end();
}
