// The buyer feed's filtering (/r/[slug]): one row of chips (All, Free, then
// each category present), available items grouped by category, and claimed
// or sold items folded into their own list below. Pure, so it's tested.

import { CATEGORIES } from "@/lib/category";

export type FeedStatus = "listed" | "claimed" | "picked_up";

export interface FeedEntry {
  category: string | null;
  status: FeedStatus;
  isFree: boolean;
  priceCents: number | null;
  availableFrom: string | null; // ISO date
}

/** "all", "free", or a category name. */
export type FeedChip = string;

const OTHER = "Other";

/** The canonical category an item sorts under; unknown or blank → Other. */
export function categoryOf(it: { category: string | null }): string {
  return it.category && (CATEGORIES as readonly string[]).includes(it.category) ? it.category : OTHER;
}

/** Free means $0 or no price (the claim flow treats both as free). */
export const isFreeItem = (it: FeedEntry) => it.isFree || it.priceCents == null;

export function matchesChip(it: FeedEntry, chip: FeedChip): boolean {
  if (chip === "all") return true;
  if (chip === "free") return isFreeItem(it);
  return categoryOf(it) === chip;
}

/**
 * The chips to show, with how many available items each one holds. Categories
 * come in canonical order (Other last) and only when the sale has an item in
 * them; Free only when something is free. Counts are what a buyer can still
 * take, so a category whose items are all claimed reads 0.
 */
export function feedChips(items: FeedEntry[]): { key: FeedChip; label: string; count: number }[] {
  const available = items.filter((it) => it.status === "listed");
  const present = new Set(items.map(categoryOf));
  const chips = [{ key: "all", label: "All", count: available.length }];
  if (items.some(isFreeItem)) {
    chips.push({ key: "free", label: "Free", count: available.filter(isFreeItem).length });
  }
  for (const c of CATEGORIES) {
    if (present.has(c)) chips.push({ key: c, label: c, count: available.filter((it) => categoryOf(it) === c).length });
  }
  return chips;
}

/**
 * Split the chip's items into what's available (soonest first) and what's
 * claimed or sold (claimed first: those still offer a waitlist).
 */
export function splitFeed<T extends FeedEntry>(items: T[], chip: FeedChip, todayIso: string) {
  const shown = items.filter((it) => matchesChip(it, chip));
  const readyBy = (it: T) => (it.availableFrom && it.availableFrom > todayIso ? it.availableFrom : todayIso);
  const available = shown
    .filter((it) => it.status === "listed")
    .sort((a, b) => readyBy(a).localeCompare(readyBy(b)));
  const rank = (it: T) => (it.status === "claimed" ? 0 : 1);
  const gone = shown.filter((it) => it.status !== "listed").sort((a, b) => rank(a) - rank(b));
  return { available, gone };
}

/** Group items by category in canonical order, keeping their order inside. */
export function groupByCategory<T extends { category: string | null }>(items: T[]) {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const key = categoryOf(it);
    buckets.set(key, [...(buckets.get(key) ?? []), it]);
  }
  return CATEGORIES.filter((c) => buckets.has(c)).map((c) => ({ category: c, items: buckets.get(c)! }));
}

/** "12 claimed or sold", "1 claimed", "3 sold". */
export function goneLabel(items: FeedEntry[]): string {
  const claimed = items.filter((it) => it.status === "claimed").length;
  const sold = items.length - claimed;
  if (claimed && sold) return `${items.length} claimed or sold`;
  return claimed ? `${claimed} claimed` : `${sold} sold`;
}

