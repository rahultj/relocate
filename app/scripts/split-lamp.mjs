// One-off: split "Standing lamp - 2 (x2)" into two items.
// - Original (id b7e825bf..., claimed by Griffin) -> renamed "Standing lamp - 2a", stays claimed.
// - New sibling "Standing lamp - 2b" -> listed/available, copies all display fields.
// Run FROM app/: node --env-file=.env.local scripts/split-lamp.mjs
import postgres from "postgres";

const SOURCE_ID = "b7e825bf-7228-4a99-acbe-1b93d24bd0a7";
const sql = postgres(process.env.DATABASE_URL);

// 4-char base32 slug (Crockford-ish), matching the app's per-listing slugs.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const randSlug = () =>
  Array.from(
    { length: 4 },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
  ).join("");

try {
  await sql.begin(async (tx) => {
    const [src] = await tx`
      select listing_id from items where id = ${SOURCE_ID}`;
    if (!src) throw new Error(`source item ${SOURCE_ID} not found`);
    const listingId = src.listing_id;

    // Mint a slug unique within the listing.
    const existing = await tx`
      select slug from items where listing_id = ${listingId}`;
    const taken = new Set(existing.map((r) => r.slug));
    let slug = randSlug();
    while (taken.has(slug)) slug = randSlug();

    // Insert the sibling, copying every display field from the source.
    const [created] = await tx`
      insert into items (
        id, listing_id, slug, name, description, condition, category,
        available_from, price_cents, is_free, bought_date,
        original_price_cents, original_box_included, photo_url,
        status, unlisted, created_at
      )
      select
        gen_random_uuid(), listing_id, ${slug}, 'Standing lamp - 2b',
        description, condition, category, available_from, price_cents,
        is_free, bought_date, original_price_cents, original_box_included,
        photo_url, 'listed', false, now()
      from items where id = ${SOURCE_ID}
      returning id, slug, name, status`;

    // Rename the original; its claim (Griffin) is untouched.
    const renamed = await tx`
      update items set name = 'Standing lamp - 2a'
      where id = ${SOURCE_ID}
      returning id, slug, name, status`;

    console.log("renamed original:", renamed);
    console.log("created sibling: ", [created]);
  });

  // Confirm final state of both rows + the surviving claim.
  const rows = await sql`
    select id, slug, name, status, unlisted
    from items where name in ('Standing lamp - 2a', 'Standing lamp - 2b')
    order by name`;
  console.log("\nfinal rows:", rows);
  const claim = await sql`
    select b.name, b.contact, c.status
    from claims c join buyers b on b.id = c.buyer_id
    where c.item_id = ${SOURCE_ID}`;
  console.log("claim on 2a:", claim);
} finally {
  await sql.end();
}
