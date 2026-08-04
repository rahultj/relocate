"use server";

// Photo actions shared by the seller surfaces. Browser-side uploads use a
// signed URL (minted here with the secret key) so image bytes go straight to
// Storage, never through a server action body. setItemPhoto persists a photo to
// an already-published item immediately (no full-listing Save needed).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { signUploads, type SignedUpload } from "@/lib/storage";
import { withListing, type ActionResult } from "@/lib/with-listing";
import { photoColumns } from "@/lib/photos";

export async function signPhotoUploads(n: number): Promise<SignedUpload[]> {
  const count = Math.max(1, Math.min(n, 100)); // sane bound
  return signUploads(count);
}

// Set the full ordered photo set for an already-published item (first = cover).
// Writes the array and keeps the legacy `photoUrl` cover mirror in sync.
export async function setItemPhotos(
  listingId: string,
  itemId: string,
  urls: string[],
): Promise<ActionResult> {
  return withListing(listingId, async (listing) => {
    await db
      .update(items)
      .set(photoColumns(urls))
      .where(and(eq(items.id, itemId), eq(items.listingId, listing.id)));
    return {};
  });
}
