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

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { listings, items, buyers, claims } from "@/db/schema";
import { revalidateListing } from "@/lib/with-listing";
import { normalizeContact } from "@/lib/contact";

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "taken" | "invalid" | "notfound" };

export type WaitlistResult =
  | { ok: true; position: number }
  | { ok: false; reason: "available" | "invalid" | "holder" | "notfound" };

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

      // Revive on conflict: a buyer who unclaimed (row left 'cancelled') and
      // re-claims must flip back to 'confirmed', else /manage (which joins on
      // confirmed) wouldn't show them. claimedAt refreshed to the new claim.
      await tx
        .insert(claims)
        .values({ itemId, buyerId: buyer.id, status: "confirmed" })
        .onConflictDoUpdate({
          target: [claims.itemId, claims.buyerId],
          set: { status: "confirmed", claimedAt: new Date() },
        });
    });
  } catch (e) {
    if (e instanceof TakenError) return { ok: false, reason: "taken" };
    throw e;
  }

  revalidateListing(listing.slug);
  return { ok: true };
}

// Buyer self-service unclaim. No OTP: the browser asserts identity by passing
// the contact it claimed with (localStorage holds it). We only release if a
// *confirmed* claim row actually exists for that (item, contact) pair — so a
// stale/forged contact can't release someone else's claim. Mirror image of
// claimItem: claim cancelled → item flips back to 'listed' (its unlisted flag,
// the buyer-feed visibility, is untouched).
export async function unclaimItem(
  listingId: string,
  itemId: string,
  contact: string,
): Promise<ClaimResult> {
  const norm = normalizeContact(contact);
  if (!norm) return { ok: false, reason: "invalid" };

  const [listing] = await db
    .select({ id: listings.id, slug: listings.slug })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  if (!listing) return { ok: false, reason: "notfound" };

  let released = false;
  await db.transaction(async (tx) => {
    const [buyer] = await tx
      .select({ id: buyers.id })
      .from(buyers)
      .where(eq(buyers.contact, norm.contact))
      .limit(1);
    if (!buyer) return; // unknown contact → nothing to release

    // Authorization gate: cancel only this buyer's confirmed claim on this item.
    const cancelled = await tx
      .update(claims)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(claims.itemId, itemId),
          eq(claims.buyerId, buyer.id),
          eq(claims.status, "confirmed"),
        ),
      )
      .returning({ id: claims.id });
    if (cancelled.length === 0) return; // not this buyer's claim → no-op

    await tx
      .update(items)
      .set({ status: "listed" })
      .where(
        and(
          eq(items.id, itemId),
          eq(items.listingId, listing.id),
          eq(items.status, "claimed"),
        ),
      );
    released = true;
  });

  if (!released) return { ok: false, reason: "notfound" };
  revalidateListing(listing.slug);
  return { ok: true };
}

// Join the waitlist for an already-claimed item. No OTP/SMS: contact is the
// identity (same trust model as claimItem). Records interest only — the seller
// reaches out manually if the item frees up (no auto-promotion). Returns the
// buyer's 1-based position in line.
export async function joinWaitlist(
  listingId: string,
  itemId: string,
  name: string,
  contact: string,
): Promise<WaitlistResult> {
  const norm = normalizeContact(contact);
  const trimmedName = name.trim();
  if (!trimmedName || !norm) return { ok: false, reason: "invalid" };

  const [listing] = await db
    .select({ id: listings.id, slug: listings.slug })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  if (!listing) return { ok: false, reason: "notfound" };

  let result: WaitlistResult = { ok: false, reason: "notfound" };
  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({ status: items.status })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.listingId, listing.id)))
      .limit(1);
    if (!item) return; // notfound
    // Only claimed items have a waitlist; if it's free, tell the UI to claim.
    if (item.status === "listed") {
      result = { ok: false, reason: "available" };
      return;
    }

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

    // Don't waitlist the person who already holds the claim.
    const [held] = await tx
      .select({ id: claims.id })
      .from(claims)
      .where(
        and(
          eq(claims.itemId, itemId),
          eq(claims.buyerId, buyer.id),
          eq(claims.status, "confirmed"),
        ),
      )
      .limit(1);
    if (held) {
      result = { ok: false, reason: "holder" };
      return;
    }

    // Next position = current max waitlist position + 1 (computed in-txn).
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${claims.position}), 0)` })
      .from(claims)
      .where(and(eq(claims.itemId, itemId), eq(claims.status, "waitlist")));
    const position = Number(max) + 1;

    await tx
      .insert(claims)
      .values({ itemId, buyerId: buyer.id, status: "waitlist", position })
      .onConflictDoUpdate({
        target: [claims.itemId, claims.buyerId],
        // Revive a left/cancelled row to the back of the line.
        set: { status: "waitlist", position, claimedAt: new Date() },
      });

    result = { ok: true, position };
  });

  if (result.ok) revalidateListing(listing.slug);
  return result;
}

// Leave the waitlist. Authorized by the remembered contact (a waitlist row must
// exist for it), mirroring unclaimItem.
export async function leaveWaitlist(
  listingId: string,
  itemId: string,
  contact: string,
): Promise<ClaimResult> {
  const norm = normalizeContact(contact);
  if (!norm) return { ok: false, reason: "invalid" };

  const [listing] = await db
    .select({ id: listings.id, slug: listings.slug })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  if (!listing) return { ok: false, reason: "notfound" };

  const [buyer] = await db
    .select({ id: buyers.id })
    .from(buyers)
    .where(eq(buyers.contact, norm.contact))
    .limit(1);
  if (!buyer) return { ok: false, reason: "notfound" };

  const left = await db
    .update(claims)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(claims.itemId, itemId),
        eq(claims.buyerId, buyer.id),
        eq(claims.status, "waitlist"),
      ),
    )
    .returning({ id: claims.id });

  if (left.length === 0) return { ok: false, reason: "notfound" };
  revalidateListing(listing.slug);
  return { ok: true };
}
