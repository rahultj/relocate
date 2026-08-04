// One-off DEMO seed: create Mayowa's listing from her CSV so Rahul can test the
// full flow (browse → claim → Pay on Venmo). Delete when done:
//   node --env-file=.env.local scripts/seed-mayowa-demo.mjs --delete
// Run from app/.
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const SLUG = "mayowa-demo";
const TITLE = "Mayowa's Moveout Sale (DEMO)";

function norm(handle, link) {
  const h = (handle ?? "").trim().replace(/^@+/, "").trim() || null;
  let l = (link ?? "").trim();
  if (l) l = /^https?:\/\//i.test(l) ? l : `https://${l}`;
  else if (h) l = `https://venmo.com/${h}`;
  else l = null;
  return { handle: h, link: l };
}

try {
  if (process.argv.includes("--delete")) {
    const r = await sql`delete from listings where slug = ${SLUG} returning slug`;
    console.log(`deleted ${r.length} listing(s): ${r.map((x) => x.slug)}`);
  } else {
    const [listing] = await sql`
      insert into listings (slug, title, intro, city, neighborhood, pickup_from, pickup_to)
      values (${SLUG}, ${TITLE},
        ${"Our whole apartment is moving out — grab something and pay the roommate who owns it via Venmo. This is a demo listing."},
        ${"Washington, D.C."}, ${"Columbia Heights"}, ${"2026-08-02"}, ${"2026-08-22"})
      returning id, slug
    `;

    const c = norm("@theMayowa", "venmo.com/theMayowa");
    const t = norm("@scoobydoomansion", "venmo.com/scoobydoomansion");
    const items = [
      {
        slug: "cch1", name: "Orange Boneless Couch",
        description: "https://a.co/d/0e2IzjqB", category: "Furniture",
        available_from: "2026-08-02", price_cents: 10000, is_free: false,
        bought_date: "2026-04-01", original_price_cents: 26000,
        venmo_handle: c.handle, venmo_link: c.link,
      },
      {
        slug: "tbl1", name: "Expandable Dining Room Table",
        description: "Seats up 10 people. Has been well loved for dinner parties and other gatherings!",
        category: "Furniture", available_from: "2026-08-22",
        price_cents: 5000, is_free: false, bought_date: "2016-01-01",
        original_price_cents: null,
        venmo_handle: t.handle, venmo_link: t.link,
      },
    ];

    for (const it of items) {
      await sql`
        insert into items (listing_id, slug, name, description, category, available_from,
          price_cents, is_free, bought_date, original_price_cents, venmo_handle, venmo_link,
          status, unlisted)
        values (${listing.id}, ${it.slug}, ${it.name}, ${it.description}, ${it.category},
          ${it.available_from}, ${it.price_cents}, ${it.is_free}, ${it.bought_date},
          ${it.original_price_cents}, ${it.venmo_handle}, ${it.venmo_link}, 'listed', false)
      `;
    }

    console.log("Created demo listing.");
    console.log(`Public:  https://mustgo.vercel.app/r/${listing.slug}`);
    console.log(`Manage:  https://mustgo.vercel.app/manage/${listing.id}`);
  }
} finally {
  await sql.end();
}
