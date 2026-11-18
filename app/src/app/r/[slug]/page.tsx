// Public listing page — /r/[slug] (section 03, buyer surface).
//
// "The landing page IS the listing": a single mobile-shaped scroll, sorted by
// the date each item becomes available. No accounts. Filter pills run
// client-side in <ListingFeed>; the header + data fetch stay on the server.

import { notFound, permanentRedirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, items } from "@/db/schema";
import { formatDayRange, formatMonthDay } from "@/lib/format";
import { listingCurrency } from "@/lib/money";
import { canonicalSlugFor } from "@/lib/listing-slug";
import { ContactLine } from "@/components/contact-line";
import { SaleIntro } from "./sale-intro";
import { ListingFeed, type FeedItem } from "./listing-feed";

// Always reflect the latest publish — listings change as the seller adds items.
export const dynamic = "force-dynamic";

async function loadListing(slug: string) {
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.slug, slug))
    .limit(1);
  if (!listing) return null;

  const rows = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.listingId, listing.id),
        eq(items.unlisted, false),
        eq(items.draft, false),
      ),
    )
    .orderBy(asc(items.availableFrom)); // nulls last (Postgres asc default)

  return { listing, rows };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadListing(slug);
  return {
    title: data ? `${data.listing.title} · mustgo` : "Listing · mustgo",
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadListing(slug);
  if (!data) {
    const canonical = await canonicalSlugFor(slug);
    if (canonical) permanentRedirect(`/r/${canonical}`);
    notFound();
  }

  const { listing, rows } = data;

  // Trim to a serializable DTO for the client feed.
  const feedItems: FeedItem[] = rows.map((it) => ({
    slug: it.slug,
    name: it.name,
    availableFrom: it.availableFrom,
    priceCents: it.priceCents,
    originalPriceCents: it.originalPriceCents,
    isFree: it.isFree,
    status: it.status,
    photoUrl: it.photoUrl,
    category: it.category,
  }));

  // Facts as short tags that never wrap mid-phrase: "Columbia Heights",
  // "Pickup Dec 1–20". The chips below already count what's available.
  const currency = listingCurrency(listing);
  // Neighborhood alone keeps the tag short; the item page shows the full place.
  const place = listing.neighborhood || listing.city;
  const pickup =
    listing.pickupFrom && listing.pickupTo
      ? `Pickup ${formatDayRange(listing.pickupFrom, listing.pickupTo, currency)}`
      : listing.pickupFrom
        ? `Pickup from ${formatMonthDay(listing.pickupFrom, currency)}`
        : null;
  const facts = [place, pickup].filter((f): f is string => Boolean(f));

  return (
    <main className="min-h-screen bg-bg-main">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col pb-12">
        <header className="px-6 pb-5 pt-9">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-hover">mustgo</p>
          <h1 className="mt-2 font-serif text-[32px] font-medium leading-[1.08] text-text-primary">
            {listing.title}
          </h1>
          {listing.intro && <SaleIntro text={listing.intro} />}
          {facts.length > 0 && (
            <ul className="mt-3.5 flex flex-wrap gap-2 text-[13px]">
              {facts.map((f) => (
                <li key={f} className="whitespace-nowrap rounded-lg bg-bg-hover px-2.5 py-1 text-text-primary">
                  {f}
                </li>
              ))}
            </ul>
          )}
          <ContactLine contacts={listing.sellerContacts} className="mt-3.5" />
        </header>

        <ListingFeed slug={slug} items={feedItems} currency={currency} />
      </div>
    </main>
  );
}
