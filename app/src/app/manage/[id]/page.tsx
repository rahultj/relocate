// Manage screen — /manage/[id] (append / edit a listing).
//
// Access is the listing's UUID, which is never exposed on buyer surfaces — it
// acts as a secret capability (no login in M1). An unknown/garbage id 404s.

import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, items, claims, buyers } from "@/db/schema";
import { ListingEditor, type EditorItem } from "./listing-editor";

export const dynamic = "force-dynamic";

// Server actions on this route (CSV import-merge especially) can touch many
// rows. The client now sends only new/changed rows, but give the function
// headroom anyway so a heavy edit never times out mid-transaction.
export const maxDuration = 60;

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

  // Soft-claim info per item, so claimed rows show who claimed + how to reach them.
  const claimRows = await db
    .select({
      itemId: claims.itemId,
      name: buyers.name,
      contact: buyers.contact,
      claimedAt: claims.claimedAt,
    })
    .from(claims)
    .innerJoin(buyers, eq(claims.buyerId, buyers.id))
    .innerJoin(items, eq(claims.itemId, items.id))
    .where(and(eq(items.listingId, listing.id), eq(claims.status, "confirmed")));
  const claimByItem = new Map(claimRows.map((c) => [c.itemId, c]));

  // Waitlist per item (ordered), so the seller can reach out manually.
  const waitRows = await db
    .select({
      itemId: claims.itemId,
      name: buyers.name,
      contact: buyers.contact,
      position: claims.position,
    })
    .from(claims)
    .innerJoin(buyers, eq(claims.buyerId, buyers.id))
    .innerJoin(items, eq(claims.itemId, items.id))
    .where(and(eq(items.listingId, listing.id), eq(claims.status, "waitlist")))
    .orderBy(asc(claims.position));
  const waitByItem = new Map<string, { name: string; contact: string }[]>();
  for (const w of waitRows) {
    const list = waitByItem.get(w.itemId) ?? [];
    list.push({ name: w.name ?? "", contact: w.contact ?? "" });
    waitByItem.set(w.itemId, list);
  }

  const initialItems: EditorItem[] = rows.map((it) => {
    const c = claimByItem.get(it.id);
    return {
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
    category: it.category,
    photoUrl: it.photoUrl,
    photoDataUrl: null,
    listed: !it.unlisted,
    claim: c
      ? {
          name: c.name ?? "",
          contact: c.contact ?? "",
          claimedAt:
            c.claimedAt instanceof Date
              ? c.claimedAt.toISOString()
              : String(c.claimedAt),
        }
      : null,
    waitlist: waitByItem.get(it.id) ?? [],
    };
  });

  // Top-of-page overview of every item with claim activity (claimed or
  // waitlisted), so the seller doesn't have to scroll the whole list to find
  // who claimed what. Jump-links target the per-row anchors below.
  const claimSummary = rows
    .filter((it) => claimByItem.has(it.id) || (waitByItem.get(it.id)?.length ?? 0) > 0)
    .map((it) => {
      const c = claimByItem.get(it.id);
      return {
        itemId: it.id,
        name: it.name,
        category: it.category ?? null,
        claimant: c ? { name: c.name ?? "", contact: c.contact ?? "" } : null,
        claimedAt: c
          ? c.claimedAt instanceof Date
            ? c.claimedAt.toISOString()
            : String(c.claimedAt)
          : null,
        waiting: waitByItem.get(it.id)?.length ?? 0,
      };
    });

  return (
    <main className="min-h-screen bg-bg-main">
      <ListingEditor
        listing={{
          id: listing.id,
          slug: listing.slug,
          title: listing.title,
          intro: listing.intro ?? "",
          contact: listing.contact ?? "",
          city: listing.city ?? "",
          neighborhood: listing.neighborhood ?? "",
          pickupFrom: listing.pickupFrom ?? "",
          pickupTo: listing.pickupTo ?? "",
        }}
        initialItems={initialItems}
        claimSummary={claimSummary}
      />
    </main>
  );
}
