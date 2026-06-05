// One-off: auto-suggest a category for existing items that have none.
// Scoped to a single listing by slug. Run from app/:
//   node --env-file=.env.local --import tsx scripts/backfill-categories.ts <slug> [--apply]
// Without --apply it's a dry run (prints the plan, writes nothing).
import postgres from "postgres";
import { suggestCategory } from "../src/lib/category";

const slug = process.argv[2];
const apply = process.argv.includes("--apply");
if (!slug) {
  console.error("usage: backfill-categories.ts <listing-slug> [--apply]");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
try {
  const [listing] = await sql<{ id: string }[]>`
    SELECT id FROM listings WHERE slug = ${slug} LIMIT 1
  `;
  if (!listing) {
    console.error(`No listing with slug "${slug}"`);
    process.exit(1);
  }

  const rows = await sql<{ id: string; name: string; category: string | null }[]>`
    SELECT id, name, category FROM items WHERE listing_id = ${listing.id}
  `;

  const counts: Record<string, number> = {};
  let updated = 0;
  for (const it of rows) {
    if (it.category) continue; // never overwrite an existing category
    const guess = suggestCategory(it.name); // null => leave uncategorized (Other)
    const label = guess ?? "(Other / unguessed)";
    counts[label] = (counts[label] ?? 0) + 1;
    if (guess && apply) {
      await sql`UPDATE items SET category = ${guess} WHERE id = ${it.id}`;
      updated++;
    }
    if (!apply) console.log(`  ${it.name}  →  ${label}`);
  }

  console.log("\nDistribution:");
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(3)}  ${k}`);
  }
  console.log(apply ? `\nApplied: ${updated} updated.` : "\nDry run — pass --apply to write.");
} finally {
  await sql.end();
}
}
main();
