"use server";

// Photo actions shared by the seller surfaces. Browser-side uploads use a
// signed URL (minted here with the secret key) so image bytes go straight to
// Storage, never through a server action body. setItemPhoto persists a photo to
// an already-published item immediately (no full-listing Save needed).

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { listings, items } from "@/db/schema";
import { signUploads, type SignedUpload } from "@/lib/storage";

export async function signPhotoUploads(n: number): Promise<SignedUpload[]> {
  const count = Math.max(1, Math.min(n, 100)); // sane bound
  return signUploads(count);
}

export interface SetItemPhotoResult {
  ok: boolean;
  error?: string;
}

export async function setItemPhoto(
  listingId: string,
  itemId: string,
  photoUrl: string,
): Promise<SetItemPhotoResult> {
  const [listing] = await db
    .select({ slug: listings.slug })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  if (!listing) return { ok: false, error: "Listing not found." };

  await db
    .update(items)
    .set({ photoUrl })
    .where(and(eq(items.id, itemId), eq(items.listingId, listingId)));

  revalidatePath(`/r/${listing.slug}`);
  revalidatePath(`/r/${listing.slug}/share`);
  revalidatePath("/");
  return { ok: true };
}
