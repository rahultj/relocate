// One-off: import Swati's "Plants" tab into the EXISTING swahul listing.
//
//   Dry-run (default, writes nothing — review the output first):
//     node --env-file=.env.local scripts/import-plants.mjs
//   Apply (insert the rows):
//     node --env-file=.env.local scripts/import-plants.mjs --apply
//   Insert them already Listed (default is staged/Unlisted so photos can be
//   attached via /manage first, then "List all"):
//     node --env-file=.env.local scripts/import-plants.mjs --apply --list
//
// Run FROM app/. Inserts into the listing with slug `swahul` — never creates a
// listing. RAW below is the tab verbatim; the transform (name/price/desc) is
// computed here so the dry-run shows exactly what lands. Photos come separately
// via the /manage "Bulk add photos" matcher (filenames ↔ these item names).
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const LISTED = process.argv.includes("--list");
const LISTING_SLUG = "swahul";

// The Plants tab, verbatim. `remarks` keeps her line breaks as array entries.
// { item, company, orig, price, pickup, remarks }  — orig/price are dollars.
const RAW = [
  { item: "african violet", company: "African Violet", orig: "", price: "10", pickup: "now", remarks: ["Maintenance: Medium", "Blooms frequently", 'Height: 5-10"'] },
  { item: "croton", company: "Croton (Gold dust)", orig: "", price: "15", pickup: "now", remarks: ["Maintenance: Medium", "Height: 15-20''"] },
  { item: "fuzzy succulent", company: "Unknown", orig: "", price: "0", pickup: "now", remarks: ["Maintenance: Low", "Likes direct sunlight", 'Height: <5"'] },
  { item: "heart leaf 1", company: "Heart Leaf Philodendron", orig: "", price: "10", pickup: "now", remarks: ["Maintenance: Low", 'Height: 5-10"'] },
  { item: "heart leaf 2", company: "Heart Leaf Philodendron", orig: "", price: "10", pickup: "now", remarks: ["Maintenance: Low", "Propogated from leaf cuttings", 'Height: 10-15"'] },
  { item: "heart leaf 3", company: "Heart Leaf Philodendron", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Low", "Propogated from leaf cuttings", 'Height: 5-10"'] },
  { item: "heart leaf 4", company: "Heart Leaf Philodendron", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Low", "Propogated from leaf cuttings", 'Height: <5"'] },
  { item: "heart leaf 5", company: "Heart Leaf Philodendron", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Low", "Propogated from leaf cuttings", 'Height: <5"'] },
  { item: "heart leaf 6", company: "Heart Leaf Philodendron", orig: "", price: "0", pickup: "now", remarks: ["Maintenance: Low", "Propogated from leaf cuttings", 'Height: <5"'] },
  { item: "jade 1", company: "Jade", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Medium/ high", "Propogated from stem cuttings", 'Height: <5"'] },
  { item: "jade 2", company: "Jade", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Medium/ high", "Propogated from stem cuttings", 'Height: 5-10"'] },
  { item: "jade 3", company: "Jade", orig: "", price: "10", pickup: "now", remarks: ["Maintenance: Medium/ high", "Propogated from stem cuttings; Has a few discoloured leaves, but otherwise healthy", 'Height: 10-15"'] },
  { item: "jade 4", company: "Jade", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Medium/ high", "Propogated from stem cuttings; Has a few discoloured leaves, but otherwise healthy", 'Height: 5-10"'] },
  { item: "jade 5", company: "Jade", orig: "", price: "10", pickup: "now", remarks: ["Maintenance: Medium/ high", "Propogated from stem cuttings; Has a few discoloured leaves, but otherwise healthy", 'Height: 5-10"'] },
  { item: "jade 6", company: "Jade", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Medium/ high", "Propogated from stem cuttings", 'Height: 5-10"'] },
  { item: "jade 7", company: "Jade", orig: "", price: "10", pickup: "now", remarks: ["Maintenance: Medium/ high", "Propogated from leaf cuttings", 'Height: <5"'] },
  { item: "nerve plant", company: "Nerve Plant", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Low", 'Height: 5-10"'] },
  { item: "peace lilly", company: "Peace Lily", orig: "", price: "0", pickup: "now", remarks: ["Maintenance: Medium/ high", "Blooms rarely (but has nice leaves!)", 'Height: 10-15"'] },
  { item: "pothos 1", company: "Pothos", orig: "", price: "10", pickup: "now", remarks: ["Maintence: Low", "Propogated from leaf cuttings", 'Height: 5-10"'] },
  { item: "pothos 2", company: "Pothos", orig: "", price: "5", pickup: "now", remarks: ["Maintence: Low", "Propogated from leaf cuttings", 'Height: 5-10"'] },
  { item: "pothos 3", company: "Pothos", orig: "", price: "5", pickup: "now", remarks: ["Maintence: Low", "Propogated from leaf cuttings", 'Height: <5"'] },
  { item: "pothos 4", company: "Pothos", orig: "", price: "10", pickup: "now", remarks: ["Maintence: Low", "Propogated from leaf cuttings", 'Height: 5-10"'] },
  { item: "pothos 5", company: "Pothos", orig: "", price: "10", pickup: "now", remarks: ["Maintence: Low", "Propogated from leaf cuttings", 'Height: 5-10"'] },
  { item: "pothos 6", company: "Pothos", orig: "", price: "15", pickup: "now", remarks: ["Maintence: Low", "Propogated from leaf cuttings", 'Height: 10-15"'] },
  { item: "prayer plant", company: "Prayer Plant", orig: "", price: "15", pickup: "now", remarks: ["Maintenance: Medium", 'Height: 5-10" (long branches)'] },
  { item: "rubber plant 1", company: "Rubber Plant (Ficus)", orig: "", price: "10", pickup: "now", remarks: ["Maintence: Low", 'Height: 15-20"'] },
  { item: "rubber plant 2", company: "Rubber Plant (Ficus)", orig: "", price: "5", pickup: "now", remarks: ["Maintence: Low", "Propogated from stem cuttings", 'Height: 10-15"'] },
  { item: "sansevieria 1", company: "Sansevieria", orig: "", price: "10", pickup: "now", remarks: ["Maintenance: Low", "Propogated from leaf cuttings", 'Height: 10-15"'] },
  { item: "sansevieria 2", company: "Sansevieria", orig: "", price: "15", pickup: "now", remarks: ["Maintenance: Low", 'Height: 40"'] },
  { item: "sansevieria 3", company: "Sansevieria", orig: "", price: "15", pickup: "now", remarks: ["Maintenance: Low", 'Height: 20"'] },
  { item: "sansevieria 4", company: "Sansevieria", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Low", "Propogated from leaf cuttings", 'Height: 5-10"'] },
  { item: "sansevieria 5", company: "Sansevieria", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Low", 'Height: 5-10"'] },
  { item: "satin pothos 1", company: "Satin Pothos", orig: "", price: "10", pickup: "now", remarks: ["Maintenance: Low", 'Height: 5-10"'] },
  { item: "satin pothos 2", company: "Satin Pothos", orig: "", price: "10", pickup: "now", remarks: ["Maintenance: Low", "Propogated from leaf cuttings", 'Height: 10-15"'] },
  { item: "shelves (3 in 1)", company: "", orig: "50", price: "10", pickup: "now", remarks: ['For small (<5") planters; plants not included'] },
  { item: "shelves (circle, set of 3)", company: "Etsy", orig: "58", price: "0", pickup: "now", remarks: ["For concrete walls only"] },
  { item: "shelves (mandala design)", company: "Etsy", orig: "25", price: "5", pickup: "now", remarks: ["Plant not included"] },
  { item: "shelves (rectangle, set of 2)", company: "Etsy", orig: "33", price: "10", pickup: "now", remarks: ["Plants not included"] },
  { item: "shelves (rectangle, set of 3)", company: "", orig: "42", price: "15", pickup: "now", remarks: ["Plants not included"] },
  { item: "spider plant", company: "", orig: "", price: "10", pickup: "now", remarks: ["Maintenance: Low", "Some leaf tips discoloured, but otherwise healthy", 'Height: 15-20"'] },
  { item: "vase-glass", company: "", orig: "", price: "0", pickup: "now", remarks: [] },
  { item: "vase-glass (set of three)", company: "", orig: "", price: "0", pickup: "", remarks: [] },
  { item: "zebra 1", company: "Zebra Plant", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Low", 'Height: 5-10"'] },
  { item: "zebra 2", company: "Zebra Plant", orig: "", price: "5", pickup: "now", remarks: ["Maintenance: Low", "Propogated from leaf cuttings; planter is slightly chipped", 'Height: <5"'] },
  { item: "zizi", company: "Zizi Plant", orig: "", price: "0", pickup: "now", remarks: ["Maintenance: Very low", 'Height: 15-20"'] },
];

// ---------- transform ----------

const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Title-case each alphabetic run, leaving digits/punctuation in place. Keeps
// names close to her likely photo filenames (the /manage matcher lowercases and
// turns -/_ into spaces), so "heart leaf 3.jpg" still matches "Heart Leaf 3".
const titleCase = (s) =>
  s.replace(/[A-Za-z][A-Za-z']*/g, (w) => w[0].toUpperCase() + w.slice(1));

// Compare identity ignoring case, spaces, digits, punctuation.
const normId = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

// Include the Company/model as a description note only when it adds something
// beyond the item name (skips retailer/"unknown" noise and plain duplicates).
const includeCompany = (company, name) => {
  const c = company.trim();
  if (!c) return false;
  const cl = c.toLowerCase();
  if (cl === "etsy" || cl === "unknown") return false;
  return normId(c) !== normId(name);
};

const dollarsToCents = (raw) => {
  const n = Number(String(raw).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

function transform(r) {
  const name = titleCase(r.item.trim());

  const segs = [];
  if (includeCompany(r.company, name)) segs.push(r.company.trim());
  for (const line of r.remarks) {
    const t = line.trim();
    if (t) segs.push(t);
  }
  const description = segs.length ? segs.join(" · ") : null;

  // "0" / blank price => Free (giveaway); otherwise dollars -> cents.
  const cents = dollarsToCents(r.price);
  const isFree = r.price.trim() === "" || cents === 0;

  const origCents = r.orig.trim() === "" ? null : dollarsToCents(r.orig);

  const availableFrom =
    r.pickup.trim().toLowerCase() === "now" ? todayISO() : null;

  return {
    name,
    description,
    priceCents: isFree ? null : cents,
    isFree,
    originalPriceCents: origCents,
    availableFrom,
    category: "Plants",
    condition: null,
  };
}

// 4-char base32 slug (Crockford-ish), matching the app's per-listing slugs.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const randSlug = () =>
  Array.from(
    { length: 4 },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
  ).join("");

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

try {
  const [listing] = await sql`
    select id, slug, title from listings where slug = ${LISTING_SLUG} limit 1`;
  if (!listing) throw new Error(`listing with slug "${LISTING_SLUG}" not found`);

  const rows = RAW.map(transform);

  console.log(`Listing: ${listing.title} (${listing.slug}) — id ${listing.id}`);
  console.log(
    `${rows.length} plant rows → category "Plants", ${LISTED ? "LISTED" : "UNLISTED (staged)"}\n`,
  );
  for (const it of rows) {
    const price = it.isFree ? "Free" : `$${it.priceCents / 100}`;
    const orig = it.originalPriceCents ? ` (was $${it.originalPriceCents / 100})` : "";
    console.log(`• ${it.name.padEnd(30)} ${price}${orig}`);
    if (it.description) console.log(`    ${it.description}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to insert.`);
  } else {
    const inserted = await sql.begin(async (tx) => {
      const existing = await tx`
        select slug from items where listing_id = ${listing.id}`;
      const taken = new Set(existing.map((e) => e.slug));
      const mint = () => {
        let s = randSlug();
        while (taken.has(s)) s = randSlug();
        taken.add(s);
        return s;
      };

      const out = [];
      for (const it of rows) {
        const [row] = await tx`
          insert into items (
            listing_id, slug, name, description, condition, category,
            available_from, price_cents, is_free, original_price_cents,
            status, unlisted
          ) values (
            ${listing.id}, ${mint()}, ${it.name}, ${it.description}, ${it.condition},
            ${it.category}, ${it.availableFrom}, ${it.priceCents}, ${it.isFree},
            ${it.originalPriceCents}, 'listed', ${!LISTED}
          )
          returning id, slug, name`;
        out.push(row);
      }
      return out;
    });

    console.log(`\nInserted ${inserted.length} items.`);
    console.log(`Public:  https://mustgo.vercel.app/r/${listing.slug}`);
    console.log(`Manage:  https://mustgo.vercel.app/manage/${listing.id}`);
    if (!LISTED)
      console.log(`They're UNLISTED — attach photos on /manage, then "List all".`);
  }
} finally {
  await sql.end();
}
