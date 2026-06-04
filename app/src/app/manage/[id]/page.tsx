// Manage screen — /manage/[id] (append / edit a listing).
//
// Access is the listing's UUID, which is never exposed on buyer surfaces — it
// acts as a secret capability (no login in M1). An unknown/garbage id 404s.

import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, items } from "@/db/schema";
import { ListingEditor, type EditorItem } from "./listing-editor";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Manage listing · mustgo" };

export default async function ManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound(); // avoid a DB error on a non-UUID path

  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);
  if (!listing) notFound();

  const rows = await db
    .select()
    .from(items)
    .where(eq(items.listingId, listing.id))
    .orderBy(asc(items.availableFrom));

  const initialItems: EditorItem[] = rows.map((it) => ({
    itemId: it.id,
    slug: it.slug,
    name: it.name,
    description: it.description ?? "",
    condition: it.condition,
    priceText: it.isFree
      ? "Free"
      : it.priceCents != null
        ? String(it.priceCents / 100)
        : "",
    originalPriceText:
      it.originalPriceCents != null ? String(it.originalPriceCents / 100) : "",
    boughtDate: it.boughtDate,
    originalBoxIncluded: it.originalBoxIncluded,
    availableFrom: it.availableFrom ?? "",
    photoUrl: it.photoUrl,
    photoDataUrl: null,
    listed: !it.unlisted,
  }));

  return (
    <main className="min-h-screen bg-bg-main">
      <ListingEditor
        listing={{
          id: listing.id,
          slug: listing.slug,
          title: listing.title,
          city: listing.city ?? "",
          neighborhood: listing.neighborhood ?? "",
          pickupFrom: listing.pickupFrom ?? "",
          pickupTo: listing.pickupTo ?? "",
        }}
        initialItems={initialItems}
      />
    </main>
  );
}
