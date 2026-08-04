"use server";

// Update action for /manage/[id]. The listing UUID is the capability — anyone
// with it can edit (no login in M1). Upserts items: existing rows (with itemId)
// are updated in place keeping their slug, new rows are inserted with a freshly
// minted slug. Removal is soft (unlisted), so we never delete here. Photos for
// new/replaced rows upload to Storage before the transaction (same pattern as
// publishListing).

import { and, eq, ne, or, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { listings, items, claims } from "@/db/schema";
import { mintSlug, toVanitySlug, isValidVanitySlug } from "@/lib/slug";
import { uploadItemPhoto } from "@/lib/storage";
import {
  withListing,
  revalidateListing,
  type ActionResult,
} from "@/lib/with-listing";
import type { ItemCondition } from "@/lib/format";
import type { SellerContact } from "@/lib/seller-contact";
import { normalizeVenmo } from "@/lib/venmo";
import { photoColumns } from "@/lib/photos";

// Venmo columns for the re-import merge, honoring "blank cells don't overwrite":
// returns {} when the seller left both fields empty, so an existing item's Venmo
// survives a re-import that omits it.
function venmoColumns(handle: string | null, link: string | null) {
  if (!(handle ?? "").trim() && !(link ?? "").trim()) return {};
  const v = normalizeVenmo({ handle, link });
  return { venmoHandle: v.handle, venmoLink: v.link };
}

// Drop blank contacts and trim fields before persisting — keeps the jsonb clean
// and lets the buyer button reliably hide when nothing real is set.
function sanitizeContacts(contacts: SellerContact[]): SellerContact[] {
  return (contacts ?? [])
    .map((c) => ({
      name: c.name?.trim() || undefined,
      value: c.value?.trim() ?? "",
      primary: c.primary || undefined,
    }))
    .filter((c) => c.value);
}

// Rename a listing's public slug to a readable one. The old slug is kept in
// `previous_slugs` so existing links / printed QR 301-redirect to the new URL.
// Uniqueness spans every listing's current slug AND every previous slug, so a
// redirect can never be ambiguous.
export async function setListingSlug(
  listingId: string,
  rawSlug: string,
): Promise<ActionResult<{ slug: string }>> {
  const slug = toVanitySlug(rawSlug);
  if (!isValidVanitySlug(slug)) {
    return {
      ok: false,
      error: "Use 3–40 letters, numbers, and hyphens (e.g. ghar-waapsi).",
    };
  }

  const [listing] = await db
    .select({
      id: listings.id,
      slug: listings.slug,
      prev: listings.previousSlugs,
    })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  if (!listing) return { ok: false, error: "Listing not found." };
  if (listing.slug === slug) return { ok: true, slug }; // no change

  // Taken if another listing uses it as its current OR a previous slug.
  const [clash] = await db
    .select({ id: listings.id })
    .from(listings)
    .where(
      and(
        ne(listings.id, listingId),
        or(
          eq(listings.slug, slug),
          sql`${slug} = ANY(${listings.previousSlugs})`,
        ),
      ),
    )
    .limit(1);
  if (clash) return { ok: false, error: "That URL is already taken." };

  // Keep the now-old slug as an alias; drop the new one from prev if we're
  // reclaiming a slug this listing used before.
  const nextPrev = Array.from(
    new Set([...listing.prev.filter((s) => s !== slug), listing.slug]),
  );

  try {
    await db
      .update(listings)
      .set({ slug, previousSlugs: nextPrev })
      .where(eq(listings.id, listingId));
  } catch {
    // unique(slug) violation from a concurrent claim
    return { ok: false, error: "That URL is already taken." };
  }

  revalidateListing(listing.slug); // old paths
  revalidateListing(slug); // new paths
  return { ok: true, slug };
}

// ============================================================ auto-save
// Per-item mutations powering the /manage editor's auto-save. Each mirrors the
// setItemPhoto pattern: targeted write, capability-checked + revalidated via
// withListing. updateListing (below) is retained only for the CSV import-merge
// commit (a deliberate bulk op behind the "Merge" button).
//
//   patchItem        existing row, any field edit   — idempotent (safe to retry)
//   createItem       a new row's first save         — returns {itemId, slug}
//   patchListingDetails  title/city/pickup edit
//   setItemsListed   per-row + bulk list/unlist     — one UPDATE ... WHERE IN
//
// Listed-state note: the schema has both `status` (M2 claim lifecycle) and
// `unlisted` (the soft-unlist buyers actually filter on). Only createItem (its
// initial value) and setItemsListed write `unlisted`; patchItem never touches
// it. That keeps the two fields from silently diverging.

// The editable, already-parsed item fields shared by create + patch. Excludes
// `unlisted` on purpose (see note above).
export interface ItemFields {
  name: string;
  description: string | null;
  condition: ItemCondition | null;
  priceCents: number | null;
  isFree: boolean;
  boughtDate: string | null;
  originalPriceCents: number | null;
  originalBoxIncluded: boolean | null;
  availableFrom: string | null;
  category: string | null;
  venmoHandle: string | null;
  venmoLink: string | null;
  photoUrls: string[]; // ordered; [0] = cover (photoUrl mirror synced here)
}

// One mapping from editor fields to DB columns, used by both create and patch.
function toItemColumns(it: ItemFields) {
  const venmo = normalizeVenmo({ handle: it.venmoHandle, link: it.venmoLink });
  return {
    name: it.name.trim(),
    description: it.description,
    condition: it.condition,
    priceCents: it.isFree ? null : it.priceCents,
    isFree: it.isFree,
    boughtDate: it.boughtDate,
    originalPriceCents: it.originalPriceCents,
    originalBoxIncluded: it.originalBoxIncluded,
    availableFrom: it.availableFrom,
    category: it.category,
    venmoHandle: venmo.handle,
    venmoLink: venmo.link,
    ...photoColumns(it.photoUrls),
  };
}

export async function patchItem(
  listingId: string,
  itemId: string,
  fields: ItemFields,
): Promise<ActionResult> {
  if (!fields.name.trim()) {
    return { ok: false, error: "Item name is required." };
  }
  return withListing(listingId, async (listing) => {
    await db
      .update(items)
      .set(toItemColumns(fields))
      .where(and(eq(items.id, itemId), eq(items.listingId, listing.id)));
    return {};
  });
}

export async function createItem(
  listingId: string,
  fields: ItemFields,
  listed: boolean,
): Promise<ActionResult<{ itemId: string; slug: string }>> {
  if (!fields.name.trim()) {
    return { ok: false, error: "Item name is required." };
  }
  return withListing(listingId, async (listing) => {
    // Keep the new slug unique within the listing.
    const existing = await db
      .select({ slug: items.slug })
      .from(items)
      .where(eq(items.listingId, listing.id));
    const used = new Set(existing.map((e) => e.slug));
    let slug = mintSlug(4);
    while (used.has(slug)) slug = mintSlug(4);

    const [row] = await db
      .insert(items)
      .values({
        listingId: listing.id,
        slug,
        ...toItemColumns(fields),
        unlisted: !listed,
        status: "listed" as const,
      })
      .returning({ id: items.id, slug: items.slug });
    return { itemId: row.id, slug: row.slug };
  });
}

export interface ListingDetailsFields {
  title: string;
  intro: string | null;
  sellerContacts: SellerContact[];
  city: string | null;
  neighborhood: string | null;
  pickupFrom: string | null;
  pickupTo: string | null;
}

export async function patchListingDetails(
  listingId: string,
  d: ListingDetailsFields,
): Promise<ActionResult> {
  if (!d.title.trim()) {
    return { ok: false, error: "A listing title is required." };
  }
  return withListing(listingId, async (listing) => {
    await db
      .update(listings)
      .set({
        title: d.title.trim(),
        intro: d.intro,
        sellerContacts: sanitizeContacts(d.sellerContacts),
        city: d.city,
        neighborhood: d.neighborhood,
        pickupFrom: d.pickupFrom,
        pickupTo: d.pickupTo,
      })
      .where(eq(listings.id, listing.id));
    return {};
  });
}

// Per-row toggle and bulk List all / Unlist all both route here — one UPDATE
// for the whole set, never a loop (matters at ~73 items).
export async function setItemsListed(
  listingId: string,
  itemIds: string[],
  listed: boolean,
): Promise<ActionResult> {
  if (itemIds.length === 0) return { ok: true };
  return withListing(listingId, async (listing) => {
    await db
      .update(items)
      .set({ unlisted: !listed })
      .where(
        and(eq(items.listingId, listing.id), inArray(items.id, itemIds)),
      );
    return {};
  });
}

// Seller-side claim release. When a buyer flakes/no-shows, the seller puts the
// item back in the feed: confirmed claim → 'cancelled', item status → 'listed'.
// Capability-checked via withListing; the item's `unlisted` flag (feed
// visibility) is left as-is, so the item returns exactly to its prior shelf.
export async function releaseClaim(
  listingId: string,
  itemId: string,
): Promise<ActionResult> {
  return withListing(listingId, async (listing) => {
    await db.transaction(async (tx) => {
      // Scope the claim cancel to this listing's item (capability boundary).
      const owned = await tx
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.id, itemId), eq(items.listingId, listing.id)))
        .limit(1);
      if (owned.length === 0) throw new Error("Item not found.");

      await tx
        .update(claims)
        .set({ status: "cancelled" })
        .where(and(eq(claims.itemId, itemId), eq(claims.status, "confirmed")));
      await tx
        .update(items)
        .set({ status: "listed" })
        .where(and(eq(items.id, itemId), eq(items.status, "claimed")));
    });
    return {};
  });
}

// Seller marks an item picked up / sold — a terminal "gone for good" state
// (distinct from claimed, which is reversible and offers a waitlist). Buyers see
// a greyed "Sold" and no waitlist. Allowed from listed OR claimed (a seller may
// sell in person without a claim). A confirmed claim becomes 'picked_up' so the
// claimant record survives rather than reading as cancelled.
export async function markSold(
  listingId: string,
  itemId: string,
): Promise<ActionResult> {
  return withListing(listingId, async (listing) => {
    await db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.id, itemId), eq(items.listingId, listing.id)))
        .limit(1);
      if (owned.length === 0) throw new Error("Item not found.");

      await tx
        .update(claims)
        .set({ status: "picked_up" })
        .where(and(eq(claims.itemId, itemId), eq(claims.status, "confirmed")));
      await tx
        .update(items)
        .set({ status: "picked_up" })
        .where(and(eq(items.id, itemId), eq(items.listingId, listing.id)));
    });
    return {};
  });
}

// Undo a "Sold": item back to listed, and any picked_up claim → cancelled.
// Deliberately does not try to restore a prior 'claimed' state.
export async function undoSold(
  listingId: string,
  itemId: string,
): Promise<ActionResult> {
  return withListing(listingId, async (listing) => {
    await db.transaction(async (tx) => {
      await tx
        .update(claims)
        .set({ status: "cancelled" })
        .where(and(eq(claims.itemId, itemId), eq(claims.status, "picked_up")));
      await tx
        .update(items)
        .set({ status: "listed" })
        .where(
          and(
            eq(items.id, itemId),
            eq(items.listingId, listing.id),
            eq(items.status, "picked_up"),
          ),
        );
    });
    return {};
  });
}

// ============================================================ bulk (import)

export interface UpdateItemInput {
  itemId: string | null; // existing item id, or null for a new item
  name: string;
  description: string | null;
  condition: ItemCondition | null;
  priceCents: number | null;
  isFree: boolean;
  boughtDate: string | null;
  originalPriceCents: number | null;
  originalBoxIncluded: boolean | null;
  availableFrom: string | null;
  category: string | null;
  venmoHandle: string | null;
  venmoLink: string | null;
  listed: boolean; // false => unlisted (hidden from feed)
  // CSV re-import never carries photos (managed via the photo strip). Kept as a
  // legacy base64 hook; always null in practice now.
  photoDataUrl: string | null;
}

export interface UpdateListingInput {
  id: string; // listing UUID — the manage capability
  title: string;
  city: string | null;
  neighborhood: string | null;
  pickupFrom: string | null;
  pickupTo: string | null;
  items: UpdateItemInput[];
}

export interface UpdateResult {
  ok: boolean;
  slug?: string;
  error?: string;
}

export async function updateListing(
  input: UpdateListingInput,
): Promise<UpdateResult> {
  if (!input.title.trim()) {
    return { ok: false, error: "A listing title is required." };
  }

  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.id, input.id))
    .limit(1);
  if (!listing) return { ok: false, error: "Listing not found." };

  // Drop blank rows (e.g. an empty "+ Add item" left untouched).
  const rows = input.items.filter((it) => it.name.trim() !== "");

  // Upload new photos before the transaction; index-aligned with `rows`.
  let photoUrls: (string | null)[];
  try {
    photoUrls = await Promise.all(
      rows.map((it) =>
        it.photoDataUrl ? uploadItemPhoto(it.photoDataUrl) : Promise.resolve(null),
      ),
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Photo upload failed.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(listings)
        .set({
          title: input.title.trim(),
          city: input.city,
          neighborhood: input.neighborhood,
          pickupFrom: input.pickupFrom,
          pickupTo: input.pickupTo,
        })
        .where(eq(listings.id, listing.id));

      // Keep new item slugs unique within the listing.
      const existing = await tx
        .select({ slug: items.slug })
        .from(items)
        .where(eq(items.listingId, listing.id));
      const used = new Set(existing.map((e) => e.slug));
      const mintItemSlug = () => {
        let s = mintSlug(4);
        while (used.has(s)) s = mintSlug(4);
        used.add(s);
        return s;
      };

      // New rows insert in one batched statement; existing rows update in
      // place. Only changed/new rows reach here (the client filters), so this
      // stays well under Vercel's function timeout even on big listings.
      const inserts: (typeof items.$inferInsert)[] = [];
      for (let i = 0; i < rows.length; i++) {
        const it = rows[i];
        // Re-import never adds photos (they're managed via the photo strip);
        // the base64 path is a legacy fallback that's normally null.
        const newPhoto = photoUrls[i] ?? null;
        const common = {
          name: it.name.trim(),
          description: it.description,
          condition: it.condition,
          priceCents: it.isFree ? null : it.priceCents,
          isFree: it.isFree,
          boughtDate: it.boughtDate,
          originalPriceCents: it.originalPriceCents,
          originalBoxIncluded: it.originalBoxIncluded,
          availableFrom: it.availableFrom,
          unlisted: !it.listed,
          // A blank category on re-import must not wipe an existing one
          // ("blank cells don't overwrite"); only set when provided.
          ...(it.category ? { category: it.category } : {}),
          // Same guard for Venmo: only write when the seller provided a value.
          ...venmoColumns(it.venmoHandle, it.venmoLink),
        };

        if (it.itemId) {
          // Existing items: leave photos untouched (managed via the photo strip,
          // not CSV) — "photos are untouched" on re-import.
          await tx
            .update(items)
            .set(common)
            .where(
              and(eq(items.id, it.itemId), eq(items.listingId, listing.id)),
            );
        } else {
          inserts.push({
            listingId: listing.id,
            slug: mintItemSlug(),
            ...common,
            ...photoColumns(newPhoto ? [newPhoto] : []),
            status: "listed" as const,
          });
        }
      }
      if (inserts.length > 0) await tx.insert(items).values(inserts);
    });

    // Reflect changes immediately on the buyer surfaces + home index.
    revalidatePath(`/r/${listing.slug}`);
    revalidatePath(`/r/${listing.slug}/share`);
    revalidatePath("/");

    return { ok: true, slug: listing.slug };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save failed — please retry.",
    };
  }
}
