// Item detail page — /r/[slug]/[itemId] (section 04, buyer surface).
//
// Design review changes 2 and 6: the price sits right under the name as the
// biggest number on the page (struck original and "% off" on a markdown), the
// facts read as one sentence, and the claim button is a bar pinned to the
// bottom (claim-button.tsx). "← All N items" leads back to the rest of the
// sale, for buyers who arrive from a printed QR code.

import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, items } from "@/db/schema";
import { formatMoney, listingCurrency } from "@/lib/money";
import { itemPayment } from "@/lib/payment";
import { canonicalSlugFor } from "@/lib/listing-slug";
import { photoList } from "@/lib/photos";
import { itemFacts, percentOff } from "@/lib/item-facts";
import { ContactButton } from "@/components/contact-button";
import { PhotoCarousel } from "@/components/photo-carousel";
import { ClaimButton } from "./claim-button";

export const dynamic = "force-dynamic";

async function loadItem(slug: string, itemSlug: string) {
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.slug, slug))
    .limit(1);
  if (!listing) return null;

  const [item] = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.listingId, listing.id),
        eq(items.slug, itemSlug),
        eq(items.draft, false), // drafts 404; unlisted items still resolve
      ),
    )
    .limit(1);
  if (!item) return null;

  // What a buyer can still take from this sale, for "← All N items".
  const [{ n }] = await db
    .select({ n: count() })
    .from(items)
    .where(
      and(
        eq(items.listingId, listing.id),
        eq(items.draft, false),
        eq(items.unlisted, false),
        eq(items.status, "listed"),
      ),
    );

  return { listing, item, available: Number(n) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}) {
  const { slug, itemId } = await params;
  const data = await loadItem(slug, itemId);
  return {
    title: data ? `${data.item.name} · mustgo` : "Item · mustgo",
  };
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}) {
  const { slug, itemId } = await params;
  const data = await loadItem(slug, itemId);
  if (!data) {
    const canonical = await canonicalSlugFor(slug);
    if (canonical) permanentRedirect(`/r/${canonical}/${itemId}`);
    notFound();
  }

  const { listing, item, available } = data;
  const photos = photoList(item);
  const currency = listingCurrency(listing);

  const isFreeItem = item.isFree || item.priceCents == null;
  const priceLabel = isFreeItem ? "Free" : formatMoney(item.priceCents!, currency);
  const off = percentOff(item);
  const facts = itemFacts(
    item,
    listing.neighborhood || listing.city || "",
    currency,
    new Date().toISOString().slice(0, 10),
  );
  const gone = item.status === "picked_up" || item.unlisted;

  return (
    <main className="min-h-screen bg-bg-main">
      <div className="mx-auto max-w-xl">
        {/* Back to the listing */}
        <Link
          href={`/r/${slug}`}
          className="flex items-center gap-1.5 px-6 pt-6 text-sm font-medium text-text-primary transition-colors hover:text-brand-hover"
        >
          <span aria-hidden>←</span>{" "}
          {available > 0 ? `All ${available} ${available === 1 ? "item" : "items"}` : "Back to the sale"}
        </Link>

        {/* Hero — a swipe carousel when there are multiple photos, a single
            whole photo (object-contain, never cropped) for one, or a compact
            letter band when there are none. */}
        <div className="mt-4">
          {photos.length > 0 ? (
            <PhotoCarousel photos={photos} alt={item.name} />
          ) : (
            <div className="flex w-full justify-center overflow-hidden border-y border-border-weave bg-bg-card">
              <span className="grid h-40 w-full place-items-center font-serif text-7xl text-text-muted">
                {item.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="px-6 pb-48 pt-6">
          <h1 className="font-serif text-3xl font-medium leading-tight text-text-primary">
            {item.name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span
              className={`font-serif text-[38px] font-semibold leading-none ${
                gone ? "text-text-muted" : isFreeItem ? "text-forest" : "text-text-primary"
              }`}
            >
              {priceLabel}
            </span>
            {off != null && (
              <>
                <s className="text-sm text-text-muted">
                  {formatMoney(item.originalPriceCents!, currency, { whole: true })}
                </s>
                <span className="self-center rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                  {off}% off
                </span>
              </>
            )}
          </p>

          {facts.length > 0 && (
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">{facts.join(" · ")}</p>
          )}

          {item.description && (
            <p className="mt-4 font-serif text-base leading-relaxed text-text-primary">
              {item.description}
            </p>
          )}

          {/* Unlisted items keep a live page (printed QR codes never 404) but
              read honestly as gone. Otherwise: claim visible-but-disabled (M2). */}
          {item.status === "picked_up" ? (
            <div className="mt-6 rounded-lg border border-border-weave bg-bg-card py-3 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-text-secondary">
                <span aria-hidden>✓</span> Sold
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
                This item has been picked up
              </p>
            </div>
          ) : item.unlisted ? (
            <div className="mt-6 rounded-lg border border-border-weave bg-bg-card py-3 text-center">
              <p className="text-sm font-medium text-text-secondary">
                No longer available
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
                This item has been taken down
              </p>
            </div>
          ) : (
            <ClaimButton
              listingId={listing.id}
              itemId={item.id}
              alreadyClaimed={item.status !== "listed"}
              payment={itemPayment({ ...listing, currency }, item)}
              priceLabel={priceLabel}
              itemName={item.name}
              photoUrl={photos[0] ?? null}
            />
          )}
        </div>
      </div>
      <ContactButton contacts={listing.sellerContacts} />
    </main>
  );
}
