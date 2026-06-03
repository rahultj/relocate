// Minimal home / index. Not a marketing landing (that's later) — just a
// navigable entry point: every published listing + the seller flow, so no one
// lands on a dead end. Lists straight from the DB.

import Link from "next/link";
import { and, desc, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { listings, items } from "@/db/schema";

export const dynamic = "force-dynamic";

async function loadListings() {
  return db
    .select({
      slug: listings.slug,
      title: listings.title,
      city: listings.city,
      neighborhood: listings.neighborhood,
      itemCount: count(items.id),
    })
    .from(listings)
    .leftJoin(
      items,
      and(eq(items.listingId, listings.id), eq(items.unlisted, false)),
    )
    .groupBy(listings.id)
    .orderBy(desc(listings.createdAt));
}

export default async function Home() {
  const rows = await loadListings();

  return (
    <main className="min-h-screen bg-bg-main">
      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
          Saudade
        </p>
        <h1 className="mt-3 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-text-primary">
          Going <em className="italic text-brand">home</em>.
        </h1>
        <p className="mt-4 max-w-md leading-relaxed text-text-secondary">
          A relocation sale, one scroll at a time. Pick a listing to browse, or
          start a new one.
        </p>

        {/* Listings */}
        <section className="mt-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            {rows.length > 0 ? "Listings" : "No listings yet"}
          </h2>

          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((l) => {
              const place = [l.neighborhood, l.city].filter(Boolean).join(", ");
              return (
                <li
                  key={l.slug}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border-weave bg-bg-card px-4 py-3"
                >
                  <Link href={`/r/${l.slug}`} className="group min-w-0 flex-1">
                    <p className="truncate font-serif text-lg font-medium text-text-primary group-hover:text-brand">
                      {l.title}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-text-muted">
                      {l.itemCount} {l.itemCount === 1 ? "item" : "items"}
                      {place && ` · ${place}`} · /r/{l.slug}
                    </p>
                  </Link>
                  <Link
                    href={`/r/${l.slug}/share`}
                    className="shrink-0 rounded-lg border border-border-alt px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover"
                  >
                    QR sheet
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Seller entry */}
        <section className="mt-10 border-t border-border-weave pt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            Seller
          </h2>
          <Link
            href="/seller/add"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            + Add items / new listing
          </Link>
        </section>
      </div>
    </main>
  );
}
