// Pure helpers for the /manage auto-save editor. Kept dependency-free (no React,
// no server imports) so they unit-test in isolation.

import { parsePriceToCents } from "./format";

/**
 * Resolve a free-text price cell into the two columns the DB stores.
 * "" or "Free" (any case) => free (priceCents null). Otherwise parse to cents.
 * One place for this so createItem and patchItem payloads can't diverge.
 */
export function parsePriceField(priceText: string): {
  isFree: boolean;
  priceCents: number | null;
} {
  const t = priceText.trim().toLowerCase();
  const cents = parsePriceToCents(priceText);
  // A zero price ("0", "$0", "0.00") means the item is a giveaway — fold it into
  // Free so it reads "Free", not "$0", on every surface.
  const isFree = t === "" || t === "free" || cents === 0;
  return { isFree, priceCents: isFree ? null : cents };
}

export interface ListedRef {
  itemId: string | null;
  listed: boolean;
}

/**
 * Split rows into the item-id groups an undo needs to re-save: ids that should
 * end up listed vs unlisted. Rows without an itemId (never persisted) are
 * dropped — there's nothing on the server to toggle.
 */
export function groupByListed(rows: ListedRef[]): {
  relist: string[];
  unlist: string[];
} {
  const relist: string[] = [];
  const unlist: string[] = [];
  for (const r of rows) {
    if (!r.itemId) continue;
    (r.listed ? relist : unlist).push(r.itemId);
  }
  return { relist, unlist };
}
