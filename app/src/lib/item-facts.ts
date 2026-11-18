// The item page's facts as one plain sentence instead of a table (design
// review change 2): "Good condition · Bought Sep 2023 · Box included ·
// Available Dec 15 · Pickup in Columbia Heights". Pure, so it's tested.

import { CONDITION_LABELS, formatMonthDay, formatMonthYear } from "@/lib/format";
import { formatMoney, type Currency } from "@/lib/money";
import type { ItemCondition } from "@/lib/format";

export interface FactsItem {
  priceCents: number | null;
  isFree: boolean;
  originalPriceCents: number | null;
  originalBoxIncluded: boolean | null;
  boughtDate: string | null; // ISO
  availableFrom: string | null; // ISO
  condition: ItemCondition | null;
}

/** Whole percent off the original, only for a real markdown; else null. */
export function percentOff(it: FactsItem): number | null {
  if (it.isFree || it.priceCents == null || it.originalPriceCents == null) return null;
  if (it.originalPriceCents <= it.priceCents || it.originalPriceCents <= 0) return null;
  const pct = Math.round((1 - it.priceCents / it.originalPriceCents) * 100);
  return pct > 0 ? pct : null;
}

/**
 * The facts in reading order, dropping any the seller didn't give. The original
 * price only appears here when it isn't already struck next to the price (a
 * free item, or one priced at or above what it cost). Availability only shows
 * when it's in the future; available now is the default.
 */
export function itemFacts(it: FactsItem, pickupPlace: string, currency: Currency, todayIso: string): string[] {
  const facts: string[] = [];
  if (it.condition) facts.push(`${CONDITION_LABELS[it.condition]} condition`);
  if (it.boughtDate) facts.push(`Bought ${formatMonthYear(it.boughtDate)}`);
  if (it.originalPriceCents != null && percentOff(it) == null) {
    facts.push(`Originally ${formatMoney(it.originalPriceCents, currency, { whole: true })}`);
  }
  if (it.originalBoxIncluded) facts.push("Box included");
  if (it.availableFrom && it.availableFrom > todayIso) facts.push(`Available ${formatMonthDay(it.availableFrom, currency)}`);
  if (pickupPlace) facts.push(`Pickup in ${pickupPlace}`);
  return facts;
}
