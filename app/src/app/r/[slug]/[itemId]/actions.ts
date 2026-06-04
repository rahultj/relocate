"use server";

// Soft claim — buyer-facing. No OTP/SMS: the contact is captured on trust and
// becomes the buyer's identity (deduped by normalized contact). See
// SOFT_CLAIM_PLAN.md. The atomic status gate is the double-claim guard.
//
//   claimItem
//     1. validate name + normalize contact        → reason:'invalid'
//     2. find listing (capability is the slug page; itemId scoped to listing)
//     3. txn:
//        a. UPDATE items SET status='claimed' WHERE id=? AND status='listed'
//           AND unlisted=false  RETURNING id      ← wins the item, atomically
//           (0 rows → already taken → throw)
//        b. upsert buyer by contact (dedupe)
//        c. insert claim (confirmed), no-op if this buyer already holds it
//     4. revalidate buyer surfaces

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, items, buyers, claims } from "@/db/schema";
import { revalidateListing } from "@/lib/with-listing";
import { normalizeContact } from "@/lib/contact";

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "taken" | "invalid" | "notfound" };

class TakenError extends Error {}

export async function claimItem(
  listingId: string,
  itemId: string,
  name: string,
  contact: string,
): Promise<ClaimResult> {
  const norm = normalizeContact(contact);
  const trimmedName = name.trim();
  if (!trimmedName || !norm) return { ok: false, reason: "invalid" };

  const [listing] = await db
    .select({ id: listings.id, slug: listings.slug })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  if (!listing) return { ok: false, reason: "notfound" };

  try {
    await db.transaction(async (tx) => {
      // Atomic claim gate — only one concurrent caller can flip listed→claimed.
      const won = await tx
        .update(items)
        .set({ status: "claimed" })
        .where(
          and(
            eq(items.id, itemId),
            eq(items.listingId, listing.id),
            eq(items.status, "listed"),
            eq(items.unlisted, false),
          ),
        )
        .returning({ id: items.id });
      if (won.length === 0) throw new TakenError();

      // One buyer per contact (dedupe across items + devices).
      const [buyer] = await tx
        .insert(buyers)
        .values({
          name: trimmedName,
          contact: norm.contact,
          contactType: norm.type,
        })
        .onConflictDoUpdate({
          target: buyers.contact,
          set: { name: trimmedName },
        })
        .returning({ id: buyers.id });

      await tx
        .insert(claims)
        .values({ itemId, buyerId: buyer.id, status: "confirmed" })
        .onConflictDoNothing({ target: [claims.itemId, claims.buyerId] });
    });
  } catch (e) {
    if (e instanceof TakenError) return { ok: false, reason: "taken" };
    throw e;
  }

  revalidateListing(listing.slug);
  return { ok: true };
}
