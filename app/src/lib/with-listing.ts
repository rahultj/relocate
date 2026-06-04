// Shared wrapper for /manage mutations. The listing UUID is the capability
// (no login in M1): every mutation loads the listing by id (404 if missing),
// runs the work, then revalidates the buyer surfaces. Centralizing this keeps
// each action a one-liner and guarantees no mutation forgets to revalidate.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { listings } from "@/db/schema";

export interface ListingRef {
  id: string;
  slug: string;
}

// Discriminated union so callers narrow on `ok`. The success arm carries any
// data the action returns (e.g. a freshly minted item id/slug).
export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function revalidateListing(slug: string) {
  revalidatePath(`/r/${slug}`);
  revalidatePath(`/r/${slug}/share`);
  revalidatePath("/");
}

export async function withListing<T extends object>(
  listingId: string,
  fn: (listing: ListingRef) => Promise<T>,
): Promise<ActionResult<T>> {
  const [listing] = await db
    .select({ id: listings.id, slug: listings.slug })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  if (!listing) return { ok: false, error: "Listing not found." };

  try {
    const data = await fn(listing);
    revalidateListing(listing.slug);
    return { ok: true, ...data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save failed — please retry.",
    };
  }
}
