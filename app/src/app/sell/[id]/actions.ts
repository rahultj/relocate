"use server";

// Camera-loop actions for /sell/[id]. Each photo becomes a draft item right
// away; drafts are hidden from buyers (`draft` 404s, and `unlisted` keeps them
// out of the feed) until the seller publishes them. Capability = listing UUID.

import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { items, listings } from "@/db/schema";
import { mintSlug } from "@/lib/slug";
import { photoColumns, photoList } from "@/lib/photos";
import { CATEGORIES } from "@/lib/category";
import type { StoredDraft } from "@/lib/ai-draft";
import { QUEUE_CONDITIONS, isReady, withBrand } from "@/lib/draft-queue";
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

// ── Draft queue (/sell/[id]/drafts) ──────────────────────────────────────────

export interface DraftPatch {
  name?: string;
  description?: string;
  category?: string;
  condition?: (typeof QUEUE_CONDITIONS)[number];
  price?: { isFree: boolean; priceCents: number | null };
}

/** Autosave one field (or a few) from the draft card. Drafts only. */
export async function saveDraftFields(
  listingId: string,
  itemId: string,
  patch: DraftPatch,
): Promise<ActionResult> {
  const set: Partial<typeof items.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 80);
    if (!name) return { ok: false, error: "Give it a name." };
    set.name = name;
  }
  if (patch.description !== undefined) set.description = patch.description.trim().slice(0, 1000) || null;
  if (patch.category !== undefined) {
    if (!(CATEGORIES as readonly string[]).includes(patch.category)) return { ok: false, error: "Unknown category." };
    set.category = patch.category;
  }
  if (patch.condition !== undefined) {
    if (!QUEUE_CONDITIONS.includes(patch.condition)) return { ok: false, error: "Unknown condition." };
    set.condition = patch.condition;
  }
  if (patch.price !== undefined) {
    const { isFree, priceCents } = patch.price;
    if (isFree) Object.assign(set, { isFree: true, priceCents: null });
    else if (Number.isInteger(priceCents) && priceCents! > 0 && priceCents! <= 100_000_000)
      Object.assign(set, { isFree: false, priceCents });
    else return { ok: false, error: "Enter a price." };
  }
  if (Object.keys(set).length === 0) return { ok: true };

  return withListing(listingId, async (listing) => {
    await db
      .update(items)
      .set(set)
      .where(and(eq(items.id, itemId), eq(items.listingId, listing.id), eq(items.draft, true)));
    return {};
  });
}

/** "Looks like X?" ✓ puts the brand in the name; ✕ just hides the chip. */
export async function answerBrandGuess(
  listingId: string,
  itemId: string,
  yes: boolean,
): Promise<ActionResult<{ name: string }>> {
  return withListing(listingId, async (listing) => {
    const where = and(eq(items.id, itemId), eq(items.listingId, listing.id), eq(items.draft, true));
    const [item] = await db.select({ name: items.name, aiDraft: items.aiDraft }).from(items).where(where);
    if (!item) throw new Error("Draft not found.");
    const stored = item.aiDraft as StoredDraft | null;
    const guess = stored?.result?.brandGuess;
    const name = yes && guess ? withBrand(item.name, guess) : item.name;
    await db
      .update(items)
      .set({ name, ...(stored ? { aiDraft: { ...stored, brandAnswer: yes ? "yes" : "no" } } : {}) })
      .where(where);
    return { name };
  });
}

/** Put ready drafts live. Anything not ready (checked here, not trusted from
 *  the client) stays a draft. */
export async function publishDrafts(
  listingId: string,
  itemIds: string[],
): Promise<ActionResult<{ published: string[] }>> {
  if (itemIds.length === 0) return { ok: true, published: [] };
  return withListing(listingId, async (listing) => {
    const rows = await db
      .select()
      .from(items)
      .where(and(inArray(items.id, itemIds), eq(items.listingId, listing.id), eq(items.draft, true)));
    const published = rows
      .filter((r) => isReady({ ...r, photoUrls: photoList(r) }))
      .map((r) => r.id);
    if (published.length > 0) {
      await db
        .update(items)
        .set({ draft: false, unlisted: false })
        .where(and(inArray(items.id, published), eq(items.listingId, listing.id)));
    }
    return { published };
  });
}
