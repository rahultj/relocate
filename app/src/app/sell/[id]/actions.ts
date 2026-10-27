"use server";

// Camera-loop actions for /sell/[id]. Each photo becomes a draft item right
// away; drafts are hidden from buyers (`draft` 404s, and `unlisted` keeps them
// out of the feed) until the seller publishes them. Capability = listing UUID.

import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { items, listings } from "@/db/schema";
import { mintSlug } from "@/lib/slug";
import { photoColumns } from "@/lib/photos";
import { withListing, type ActionResult } from "@/lib/with-listing";

/** Create a draft item from freshly uploaded photo URLs (cover first). */
export async function createDraftItem(
  listingId: string,
  photoUrls: string[],
): Promise<ActionResult<{ itemId: string; name: string }>> {
  if (photoUrls.length === 0) return { ok: false, error: "Add a photo first." };
  return withListing(listingId, async (listing) => {
    const [sale] = await db
      .select({ pickupFrom: listings.pickupFrom })
      .from(listings)
      .where(eq(listings.id, listing.id));
    const [{ n }] = await db
      .select({ n: count() })
      .from(items)
      .where(eq(items.listingId, listing.id));
    // Placeholder until the AI (slice 5) or the seller names it.
    const name = `Item ${n + 1}`;

    // Item slugs are unique per listing; the camera loop can fire two creates
    // back to back, so retry on a collision rather than pre-checking.
    for (let i = 0; ; i++) {
      try {
        const [row] = await db
          .insert(items)
          .values({
            listingId: listing.id,
            slug: mintSlug(4),
            name,
            availableFrom: sale?.pickupFrom ?? null,
            ...photoColumns(photoUrls),
            draft: true,
            unlisted: true,
            status: "listed" as const,
          })
          .returning({ id: items.id });
        return { itemId: row.id, name };
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === "23505" && i < 7) continue;
        throw err;
      }
    }
  });
}

/** Save the "Tell us about it" sentence on a draft. */
export async function saveSellerNote(
  listingId: string,
  itemId: string,
  note: string,
): Promise<ActionResult> {
  return withListing(listingId, async (listing) => {
    await db
      .update(items)
      .set({ sellerNote: note.trim().slice(0, 1000) || null })
      .where(and(eq(items.id, itemId), eq(items.listingId, listing.id)));
    return {};
  });
}

/** Discard a bad shot. Only drafts can be deleted; live items are unlisted instead. */
export async function deleteDraftItem(
  listingId: string,
  itemId: string,
): Promise<ActionResult> {
  return withListing(listingId, async (listing) => {
    await db
      .delete(items)
      .where(
        and(
          eq(items.id, itemId),
          eq(items.listingId, listing.id),
          eq(items.draft, true),
        ),
      );
    return {};
  });
}
