"use server";

// Update action for /manage/[id]. The listing UUID is the capability — anyone
// with it can edit (no login in M1). Upserts items: existing rows (with itemId)
// are updated in place keeping their slug, new rows are inserted with a freshly
// minted slug. Removal is soft (unlisted), so we never delete here. Photos for
// new/replaced rows upload to Storage before the transaction (same pattern as
// publishListing).

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { listings, items } from "@/db/schema";
import { mintSlug } from "@/lib/slug";
import { uploadItemPhoto } from "@/lib/storage";
import type { ItemCondition } from "@/lib/format";

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
  listed: boolean; // false => unlisted (hidden from feed)
  photoDataUrl: string | null; // new/replacement upload (base64)
  photoUrl: string | null; // existing stored URL (kept when no new upload)
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

      for (let i = 0; i < rows.length; i++) {
        const it = rows[i];
        const newPhoto = photoUrls[i];
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
        };

        if (it.itemId) {
          await tx
            .update(items)
            .set(newPhoto ? { ...common, photoUrl: newPhoto } : common)
            .where(
              and(eq(items.id, it.itemId), eq(items.listingId, listing.id)),
            );
        } else {
          await tx.insert(items).values({
            listingId: listing.id,
            slug: mintItemSlug(),
            ...common,
            photoUrl: newPhoto,
            status: "listed" as const,
          });
        }
      }
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
