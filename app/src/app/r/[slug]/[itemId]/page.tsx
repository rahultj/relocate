// Item detail page — /r/[slug]/[itemId] (section 04, buyer surface).
//
// Full trust-signal meta block (price, Bought, Originally, condition, pickup)
// rendered straight from the seller's CSV import. The claim button is visible
// but DISABLED with a quiet "Claims open soon" label — M1 ships the surface
// honestly; the claim/OTP flow is M2. (Buyer-first principle: disabled, not
// hidden — see CLAUDE.md.)

import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, items } from "@/db/schema";
import {
  formatPrice,
  formatDate,
  formatMonthYear,
  CONDITION_LABELS,
} from "@/lib/format";
import { canonicalSlugFor } from "@/lib/listing-slug";
import { ContactButton } from "@/components/contact-button";
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
    .where(and(eq(items.listingId, listing.id), eq(items.slug, itemSlug)))
    .limit(1);
  if (!item) return null;

  return { listing, item };
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

  const { listing, item } = data;

  const priceLabel =
    item.isFree || item.priceCents == null
      ? "Free"
      : formatPrice(item.priceCents);

  const pickupPlace = [listing.neighborhood, listing.city]
    .filter(Boolean)
    .join(", ");

  // Build the meta rows, dropping any the seller didn't provide.
  const isFreeItem = item.isFree || item.priceCents == null;
  // A real markdown: struck original anchors the deal right on the Price row.
  const showDiscount =
    !isFreeItem &&
    item.originalPriceCents != null &&
    item.priceCents != null &&
    item.originalPriceCents > item.priceCents;
  const rows: {
    label: string;
    value: string;
    struck?: string;
    serif?: boolean;
    accent?: boolean;
  }[] = [
    {
      label: "Price",
      value: priceLabel,
      struck: showDiscount ? formatPrice(item.originalPriceCents!) : undefined,
      serif: true,
      accent: isFreeItem,
    },
  ];
  if (item.boughtDate)
    rows.push({ label: "Bought", value: formatMonthYear(item.boughtDate) });
  // "Originally" as its own row only when it isn't already struck on Price
  // (avoids showing $200 twice). Box-included info is preserved either way.
  if (item.originalPriceCents != null && !showDiscount)
    rows.push({
      label: "Originally",
      value:
        formatPrice(item.originalPriceCents) +
        (item.originalBoxIncluded ? " · Box included" : ""),
    });
  else if (showDiscount && item.originalBoxIncluded)
    rows.push({ label: "Box", value: "Included" });
  if (item.availableFrom)
    rows.push({ label: "Available from", value: formatDate(item.availableFrom) });
  if (item.condition)
    rows.push({ label: "Condition", value: CONDITION_LABELS[item.condition] });
  if (pickupPlace) rows.push({ label: "Pickup", value: pickupPlace });

  return (
    <main className="min-h-screen bg-bg-main">
      <div className="mx-auto max-w-xl">
        {/* Back to the listing */}
        <Link
          href={`/r/${slug}`}
          className="flex items-center gap-1.5 px-6 pt-6 text-xs font-medium text-text-muted transition-colors hover:text-brand"
        >
          <span aria-hidden>←</span> {listing.title}
        </Link>

        {/* Hero — show the real photo whole (object-contain), never cropped:
            a round table or a portrait shot keeps its shape, with a little
            cream letterbox rather than a center-crop. Capped height so a tall
            photo doesn't push the title and claim button off the fold.
            Photoless items get a compact letter band instead of a big empty
            square. */}
        <div className="mt-4 flex w-full justify-center overflow-hidden border-y border-border-weave bg-bg-card">
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.photoUrl}
              alt={item.name}
              className="max-h-[28rem] w-auto max-w-full object-contain"
            />
          ) : (
            <span className="grid h-40 w-full place-items-center font-serif text-7xl text-text-muted">
              {item.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="px-6 pb-28 pt-6">
          <h1 className="font-serif text-3xl font-medium leading-tight text-text-primary">
            {item.name}
          </h1>

          {/* Trust-signal meta block */}
          <dl className="mt-4 flex flex-col gap-2 rounded-[10px] border border-insight-border bg-insight-bg px-4 py-3">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between gap-4"
              >
                <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                  {r.label}
                </dt>
                <dd
                  className={
                    r.serif
                      ? `flex items-baseline gap-2 font-serif text-lg font-medium ${
                          r.accent ? "text-forest" : "text-text-primary"
                        }`
                      : "font-mono text-[11px] font-medium text-text-primary"
                  }
                >
                  {r.struck && (
                    <span className="font-mono text-[11px] font-normal text-text-muted line-through">
                      {r.struck}
                    </span>
                  )}
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>

          {item.description && (
            <p className="mt-4 font-serif text-base leading-relaxed text-text-primary">
              {item.description}
            </p>
          )}

          {/* Unlisted items keep a live page (printed QR codes never 404) but
              read honestly as gone. Otherwise: claim visible-but-disabled (M2). */}
          {item.unlisted ? (
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
            />
          )}
        </div>
      </div>
      <ContactButton />
    </main>
  );
}
