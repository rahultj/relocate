// Claims tab on the seller home (design "C · Claims tab"): the two totals, and
// claims grouped by person or by item. Same rules as the Items tab's status
// line: hidden and sold items have no open claims. Pure so it unit-tests.

import type { HomeItem } from "./seller-home";

const priceOf = (it: HomeItem) => (it.isFree ? 0 : it.priceCents ?? 0);
const isOpen = (it: HomeItem) => it.listed && !it.sold;

export interface Total {
  cents: number;
  count: number;
}

/** "$X claimed, N items" and "$Y sold, N items". Free items count, at zero. */
export function claimTotals(items: HomeItem[]): { claimed: Total; sold: Total } {
  const claimed = { cents: 0, count: 0 };
  const sold = { cents: 0, count: 0 };
  for (const it of items) {
    if (it.sold) {
      sold.cents += priceOf(it);
      sold.count++;
    } else if (isOpen(it) && it.claim) {
      claimed.cents += priceOf(it);
      claimed.count++;
    }
  }
  return { claimed, sold };
}

export interface PersonGroup {
  key: string;
  name: string;
  contact: string;
  totalCents: number;
  items: HomeItem[];
}

/** One card per buyer with an open claim, keyed by contact (else name). */
export function claimsByPerson(items: HomeItem[]): PersonGroup[] {
  const groups = new Map<string, PersonGroup>();
  for (const it of items) {
    if (!isOpen(it) || !it.claim) continue;
    const key = (it.claim.contact || it.claim.name).trim().toLowerCase() || it.id;
    const g = groups.get(key) ?? {
      key,
      name: it.claim.name.trim(),
      contact: it.claim.contact.trim(),
      totalCents: 0,
      items: [],
    };
    g.items.push(it);
    g.totalCents += priceOf(it);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.name || "~").localeCompare(b.name || "~"));
}

/** Items with an open claim or a waitlist: claimed first, then waitlist-only. */
export function claimsByItem(items: HomeItem[]): HomeItem[] {
  return items
    .filter((it) => isOpen(it) && (it.claim || it.waitlist.length > 0))
    .sort((a, b) => Number(!a.claim) - Number(!b.claim) || a.name.localeCompare(b.name));
}

/** Sold items, for the list under the claims with its Undo. */
export function soldItems(items: HomeItem[]): HomeItem[] {
  return items.filter((it) => it.sold).sort((a, b) => a.name.localeCompare(b.name));
}
