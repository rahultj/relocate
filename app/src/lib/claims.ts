// Waitlist auto-promotion (WAITLIST_PROMOTION_PLAN.md). When a claim is
// released, by the seller or by the buyer, the first person on the waitlist
// gets it: their waitlist row becomes the confirmed claim, stamped promoted_at
// so the seller screens can say "Promoted · reach out" (nothing is texted).
// The rest of the line moves up. The item only goes back to the feed when
// nobody is waiting. Always runs inside the caller's transaction.

import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { buyers, claims } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface PromotedClaim {
  name: string;
  contact: string;
  claimedAt: string; // ISO
  promoted: true;
}

/** Promote #1 on the item's waitlist to the claim; null when nobody is waiting. */
export async function promoteNextWaiter(tx: Tx, itemId: string): Promise<PromotedClaim | null> {
  const line = await tx
    .select({ id: claims.id, name: buyers.name, contact: buyers.contact })
    .from(claims)
    .innerJoin(buyers, eq(claims.buyerId, buyers.id))
    .where(and(eq(claims.itemId, itemId), eq(claims.status, "waitlist")))
    .orderBy(asc(claims.position), asc(claims.claimedAt));
  if (line.length === 0) return null;

  const [next, ...rest] = line;
  const now = new Date();
  await tx
    .update(claims)
    .set({ status: "confirmed", claimedAt: now, promotedAt: now, position: null })
    .where(eq(claims.id, next.id));
  // Renumber what's left 1, 2, 3… (also closes gaps left by people who left).
  for (const [i, w] of rest.entries()) {
    await tx.update(claims).set({ position: i + 1 }).where(eq(claims.id, w.id));
  }
  return { name: next.name ?? "", contact: next.contact ?? "", claimedAt: now.toISOString(), promoted: true };
}
