// Throwaway sale for phone-testing a branch on its Vercel preview: 6 items
// (available with a markdown, claimed with a 2-person waitlist, claimed with
// one waiting, sold, free, hidden) and 3 fake buyers. Run from app/:
//   node --env-file=.env.local scripts/seed-phone-test.mjs           # create
//   node --env-file=.env.local scripts/seed-phone-test.mjs --delete  # clean up
// Shared DB: this writes to the live database. Always run --delete when done.
// Buyers a test creates by claiming (not the 3 seeded ones) need deleting too.
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const SLUG = "ptst";
const PREVIEW = process.env.PREVIEW_URL ?? "https://mustgo.vercel.app"; // e.g. the PR preview
const BUYERS = [
  { name: "Test Buyer A", contact: "+12025550147", type: "phone" },
  { name: "Test Buyer B", contact: "test-buyer-b@example.com", type: "email" },
  { name: "Test Buyer C", contact: "test-buyer-c@example.com", type: "email" },
];

try {
  if (process.argv.includes("--delete")) {
    const l = await sql`delete from listings where slug = ${SLUG} returning slug`;
    const b = await sql`delete from buyers where contact in ${sql(BUYERS.map((x) => x.contact))} returning contact`;
    console.log(`deleted ${l.length} listing(s), ${b.length} buyer(s)`);
  } else {
    const [listing] = await sql`
      insert into listings (slug, title, intro, neighborhood, pickup_from, pickup_to,
        currency, default_venmo_handle, seller_contacts)
      values (${SLUG}, ${"Phone test sale (DELETE ME)"},
        ${"Throwaway sale for testing the seller tabs."}, ${"Dupont Circle"},
        ${"2026-11-20"}, ${"2026-12-05"}, ${"USD"}, ${"test-venmo"},
        ${sql.json([{ name: "Rahul", value: "202-555-0100", primary: true }])})
      returning id, slug`;

    const rows = [
      ["Floor lamp", "Lighting", 2500, "good", "listed"],
      ["Bookshelf", "Furniture", 4000, "like_new", "claimed"], // claimed by A, B and C waiting
      ["Kettle", "Kitchen", 1500, "fair", "claimed"], // claimed by B, C waiting
      ["Desk chair", "Furniture", 3000, "good", "picked_up"], // sold to A
      ["Pothos", "Plants", 0, "good", "listed"], // free
      ["Old monitor", "Electronics", 2000, "worn", "listed", true], // hidden
    ];
    const ids = {};
    let n = 0;
    for (const [name, category, cents, condition, status, unlisted = false] of rows) {
      const [it] = await sql`
        insert into items (listing_id, slug, name, category, price_cents, is_free,
          condition, status, unlisted, original_price_cents, bought_date, description)
        values (${listing.id}, ${`pt${n++}x`}, ${name}, ${category}, ${cents}, ${cents === 0},
          ${condition}, ${status}, ${unlisted}, ${name === "Floor lamp" ? 7200 : null},
          ${name === "Floor lamp" ? "2023-09-01" : null},
          ${name === "Floor lamp" ? "Brass arc lamp, warm bulb included. A small scuff on the base, otherwise like new. Plugs into any outlet; the shade is linen." : null})
        returning id`;
      ids[name] = it.id;
    }

    const bid = {};
    for (const b of BUYERS) {
      const [r] = await sql`
        insert into buyers (name, contact, contact_type) values (${b.name}, ${b.contact}, ${b.type})
        on conflict (contact) do update set name = excluded.name returning id`;
      bid[b.name] = r.id;
    }
    const A = bid["Test Buyer A"], B = bid["Test Buyer B"], C = bid["Test Buyer C"];
    await sql`insert into claims (item_id, buyer_id, status) values
      (${ids["Bookshelf"]}, ${A}, 'confirmed'),
      (${ids["Kettle"]}, ${B}, 'confirmed'),
      (${ids["Desk chair"]}, ${A}, 'picked_up')`;
    await sql`insert into claims (item_id, buyer_id, status, position) values
      (${ids["Bookshelf"]}, ${B}, 'waitlist', 1),
      (${ids["Bookshelf"]}, ${C}, 'waitlist', 2),
      (${ids["Kettle"]}, ${C}, 'waitlist', 1)`;

    console.log(`Seller:  ${PREVIEW}/sell/${listing.id}`);
    console.log(`Buyer:   ${PREVIEW}/r/${listing.slug}`);
  }
} finally {
  await sql.end();
}
