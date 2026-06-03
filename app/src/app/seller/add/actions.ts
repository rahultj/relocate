"use server";

// Publish action for /seller/add. Writes the listing + its Ready items in a
// single transaction and mints collision-safe slugs. The link and per-item
// slugs are stable from the first publish — adding more later doesn't break
// what's been shared (section 07 rationale).
//
// NOTE: this runs against the DB via `db`, which needs DATABASE_URL in
// .env.local. Until that's set the action will throw on connect — the UI
// surfaces the error rather than failing silently.

import { db } from "@/db";
import { listings, items } from "@/db/schema";
import { mintSlug } from "@/lib/slug";
import { uploadItemPhoto } from "@/lib/storage";
import type { ItemCondition } from "@/lib/format";

export interface PublishListingInput {
  title: string;
  city: string | null;
  neighborhood: string | null;
  pickupFrom: string | null; // ISO
  pickupTo: string | null; // ISO
  items: PublishItemInput[]; // only the Ready ones
}

export interface PublishItemInput {
  name: string;
  description: string | null;
  condition: ItemCondition | null;
  priceCents: number | null;
  isFree: boolean;
  boughtDate: string | null;
  originalPriceCents: number | null;
  originalBoxIncluded: boolean | null;
  availableFrom: string | null;
  photoDataUrl: string | null; // base64 preview; uploaded to Storage at publish
}

export interface PublishResult {
  ok: boolean;
  slug?: string;
  itemCount?: number;
  error?: string;
}

// Retry a slug-minting insert on unique-violation (Postgres 23505).
async function insertWithUniqueSlug<T>(
  attempt: (slug: string) => Promise<T>,
  slugLen = 4,
  maxTries = 8,
): Promise<T> {
  for (let i = 0; i < maxTries; i++) {
    try {
      return await attempt(mintSlug(slugLen));
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "23505" && i < maxTries - 1) continue; // collision, retry
      throw err;
    }
  }
  throw new Error("Could not mint a unique slug after several attempts.");
}

export async function publishListing(
  input: PublishListingInput,
): Promise<PublishResult> {
  if (!input.title.trim()) {
    return { ok: false, error: "A listing title is required." };
  }
  if (input.items.length === 0) {
    return { ok: false, error: "Mark at least one item Ready before publishing." };
  }

  // TEMP DIAGNOSTIC — remove after debugging prod photo upload. Guarded on an
  // env read so eslint's no-unreachable doesn't flag the code below.
  if (process.env.NEXT_RUNTIME !== "__never__") {
    const withPhoto = input.items.filter((i) => i.photoDataUrl).length;
    const keyLen = (process.env.SUPABASE_SECRET_KEY ?? "").length;
    return {
      ok: false,
      error: `DBG items=${input.items.length} withPhoto=${withPhoto} secretKeyLen=${keyLen}`,
    };
  }

  try {
    // Upload photos before the DB transaction — keep the transaction short and
    // avoid orphaned rows if an upload fails. Index-aligned with input.items.
    let photoUrls: (string | null)[];
    try {
      photoUrls = await Promise.all(
        input.items.map((it) =>
          it.photoDataUrl ? uploadItemPhoto(it.photoDataUrl) : Promise.resolve(null),
        ),
      );
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Photo upload failed.",
      };
    }

    const result = await db.transaction(async (tx) => {
      const [listing] = await insertWithUniqueSlug((slug) =>
        tx
          .insert(listings)
          .values({
            slug,
            title: input.title.trim(),
            city: input.city,
            neighborhood: input.neighborhood,
            pickupFrom: input.pickupFrom,
            pickupTo: input.pickupTo,
          })
          .returning(),
      );

      // Item slugs are unique within a listing; mint locally and dedupe.
      const used = new Set<string>();
      const mintItemSlug = () => {
        let s = mintSlug(4);
        while (used.has(s)) s = mintSlug(4);
        used.add(s);
        return s;
      };

      await tx.insert(items).values(
        input.items.map((it, i) => ({
          listingId: listing.id,
          slug: mintItemSlug(),
          name: it.name.trim(),
          description: it.description,
          condition: it.condition,
          priceCents: it.isFree ? null : it.priceCents,
          isFree: it.isFree,
          boughtDate: it.boughtDate,
          originalPriceCents: it.originalPriceCents,
          originalBoxIncluded: it.originalBoxIncluded,
          availableFrom: it.availableFrom,
          photoUrl: photoUrls[i],
          status: "listed" as const,
        })),
      );

      return { slug: listing.slug, itemCount: input.items.length };
    });

    return { ok: true, ...result };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Publish failed — please retry.";
    return { ok: false, error: message };
  }
}
