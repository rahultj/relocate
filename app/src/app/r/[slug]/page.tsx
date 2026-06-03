// Public listing page — /r/[slug] (section 03, buyer surface).
//
// "The landing page IS the listing": a single mobile-shaped scroll, sorted by
// the date each item becomes available. No accounts. Filter pills run
// client-side in <ListingFeed>; the header + data fetch stay on the server.

import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, items } from "@/db/schema";
import { formatMonthDay } from "@/lib/format";
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
    .where(eq(items.listingId, listing.id))
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
    title: data ? `${data.listing.title} · Saudade` : "Listing · Saudade",
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadListing(slug);
  if (!data) notFound();

  const { listing, rows } = data;

  // Trim to a serializable DTO for the client feed.
  const feedItems: FeedItem[] = rows.map((it) => ({
    slug: it.slug,
    name: it.name,
    description: it.description,
    availableFrom: it.availableFrom,
    priceCents: it.priceCents,
    isFree: it.isFree,
    status: it.status,
    photoUrl: it.photoUrl,
  }));

  // Byline: "Washington, D.C. · Logan Circle · Pickup Jun 12 → Jun 24"
  const place = [listing.city, listing.neighborhood].filter(Boolean).join(", ");
  const pickup =
    listing.pickupFrom && listing.pickupTo
      ? `Pickup ${formatMonthDay(listing.pickupFrom)} → ${formatMonthDay(listing.pickupTo)}`
      : listing.pickupFrom
        ? `Pickup from ${formatMonthDay(listing.pickupFrom)}`
        : null;
  const bylineParts = [place, pickup].filter(Boolean);

  return (
    <main className="min-h-screen bg-bg-main">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col">
        <header className="border-b border-border-weave px-6 pb-4 pt-9">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
            {listing.title}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-medium leading-tight text-text-primary">
            {feedItems.length} {feedItems.length === 1 ? "thing" : "things"},
            going home.
          </h1>
          {bylineParts.length > 0 && (
            <p className="mt-2 text-sm text-text-secondary">
              {bylineParts.map((part, i) => (
                <span key={i}>
                  {i > 0 && (
                    <span className="mx-1.5 text-border-alt">·</span>
                  )}
                  {part}
                </span>
              ))}
            </p>
          )}
        </header>

        <ListingFeed slug={slug} items={feedItems} />
      </div>
    </main>
  );
}
