// Server-only loader shared by the seller tabs (/sell/[id], /claims, /sale):
// the listing, every published item with its claim, sale and waitlist, the
// drafts, and the counts the tab bar shows. The listing UUID is the capability.

import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { buyers, claims, items, listings } from "@/db/schema";
import { photoList } from "@/lib/photos";
import { homeStatus, openClaimCount, type HomeItem } from "@/lib/seller-home";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadSale(id: string) {
  if (!UUID_RE.test(id)) notFound(); // avoid a DB error on a non-UUID path

  const [listing] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!listing) notFound();

  const [rows, claimRows, h] = await Promise.all([
    db.select().from(items).where(eq(items.listingId, listing.id)).orderBy(desc(items.createdAt)),
    db
      .select({
        itemId: claims.itemId,
        status: claims.status,
        name: buyers.name,
        contact: buyers.contact,
        claimedAt: claims.claimedAt,
      })
      .from(claims)
      .innerJoin(buyers, eq(claims.buyerId, buyers.id))
      .innerJoin(items, eq(claims.itemId, items.id))
      .where(eq(items.listingId, listing.id))
      .orderBy(asc(claims.position)),
    headers(),
  ]);

  // Claims, sales and waitlists per item.
  const claimOf = new Map<string, HomeItem["claim"]>();
  const soldTo = new Map<string, string>();
  const waitlist = new Map<string, { name: string; contact: string }[]>();
  for (const c of claimRows) {
    const who = { name: c.name ?? "", contact: c.contact ?? "" };
    if (c.status === "confirmed") {
      const at = c.claimedAt instanceof Date ? c.claimedAt.toISOString() : String(c.claimedAt ?? "");
      claimOf.set(c.itemId, { ...who, claimedAt: at });
    } else if (c.status === "picked_up") soldTo.set(c.itemId, who.name);
    else if (c.status === "waitlist") waitlist.set(c.itemId, [...(waitlist.get(c.itemId) ?? []), who]);
  }

  const drafts = rows.filter((r) => r.draft).reverse(); // oldest first, as shot
  const published: HomeItem[] = rows
    .filter((r) => !r.draft)
    .map((r) => {
      const claim = claimOf.get(r.id) ?? null;
      const waits = waitlist.get(r.id) ?? [];
      const photos = photoList(r);
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        photoUrl: photos[0] ?? null,
        photoUrls: photos,
        priceCents: r.priceCents,
        isFree: r.isFree,
        listed: !r.unlisted,
        sold: r.status === "picked_up",
        claimant: claim?.name ?? null,
        waiting: waits.length,
        description: r.description,
        condition: r.condition,
        category: r.category,
        boughtDate: r.boughtDate,
        originalPriceCents: r.originalPriceCents,
        originalBoxIncluded: r.originalBoxIncluded,
        availableFrom: r.availableFrom,
        venmoHandle: r.venmoHandle,
        venmoLink: r.venmoLink,
        upiId: r.upiId,
        claim,
        soldTo: soldTo.get(r.id) ?? null,
        waitlist: waits,
      };
    });

  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return {
    listing,
    published,
    drafts,
    claimsCount: openClaimCount(published.map(homeStatus)),
    origin: `${proto}://${host}`,
  };
}

export type LoadedSale = Awaited<ReturnType<typeof loadSale>>;
