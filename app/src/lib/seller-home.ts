// Seller home (/sell/[id]) item list: each item's status line, the filter
// chips and the Claims tab count. Same rules as the /manage claims overview:
// sold and hidden items have no open claim activity. Pure so it unit-tests.

import type { ItemCondition } from "./format";

/** A published item as the seller pages (Items, Claims, the item sheet) see it. */
export interface HomeItem {
  id: string;
  slug: string;
  name: string;
  photoUrl: string | null; // cover, mirrors photoUrls[0]
  photoUrls: string[];
  priceCents: number | null;
  isFree: boolean;
  listed: boolean;
  sold: boolean;
  claimant: string | null; // confirmed claimant's name, mirrors claim?.name
  waiting: number; // mirrors waitlist.length
  description: string | null;
  condition: ItemCondition | null;
  category: string | null;
  boughtDate: string | null;
  originalPriceCents: number | null;
  originalBoxIncluded: boolean | null;
  availableFrom: string | null;
  venmoHandle: string | null;
  venmoLink: string | null;
  upiId: string | null;
  // promoted: they got it off the waitlist and don't know yet (reach out).
  claim: { name: string; contact: string; claimedAt: string; promoted?: boolean } | null;
  soldTo: string | null;
  waitlist: { name: string; contact: string }[];
}

export type HomeStatus =
  | { kind: "sold" }
  | { kind: "hidden" }
  | { kind: "claimed"; by: string; waiting: number }
  | { kind: "available"; waiting: number };

export interface HomeItemState {
  listed: boolean;
  sold: boolean;
  claimant: string | null; // confirmed claimant's name, if any
  waiting: number; // waitlist length
}

export function homeStatus(it: HomeItemState): HomeStatus {
  if (it.sold) return { kind: "sold" };
  if (!it.listed) return { kind: "hidden" };
  if (it.claimant != null) return { kind: "claimed", by: it.claimant, waiting: it.waiting };
  return { kind: "available", waiting: it.waiting };
}

export function statusLine(s: HomeStatus): string {
  const waiting = (n: number) => (n > 0 ? ` · ${n} waiting` : "");
  switch (s.kind) {
    case "sold":
      return "Sold";
    case "hidden":
      return "Hidden from buyers";
    case "claimed":
      return `Claimed${s.by.trim() ? ` by ${s.by.trim()}` : ""}${waiting(s.waiting)}`;
    case "available":
      return `Available${waiting(s.waiting)}`;
  }
}

export type HomeFilter = "all" | "available" | "hidden";

export function matchesFilter(s: HomeStatus, f: HomeFilter): boolean {
  return f === "all" || s.kind === f;
}

/** Chip counts; a chip shows only when its count is above zero. */
export function filterCounts(statuses: HomeStatus[]): { available: number; hidden: number } {
  let available = 0;
  let hidden = 0;
  for (const s of statuses) {
    if (s.kind === "available") available++;
    else if (s.kind === "hidden") hidden++;
  }
  return { available, hidden };
}

/** Items with open claim activity: a claim or a waitlist on a listed, unsold item. */
export function openClaimCount(statuses: HomeStatus[]): number {
  return statuses.filter(
    (s) => s.kind === "claimed" || (s.kind === "available" && s.waiting > 0),
  ).length;
}

/**
 * What releasing an item's claim does, for the seller screens to show at once:
 * the first person waiting takes the claim (promoted) and the line moves up;
 * with nobody waiting, the item is simply unclaimed. Mirrors lib/claims.ts.
 */
export function releasePatch(it: Pick<HomeItem, "waitlist">, nowIso: string): Partial<HomeItem> {
  const [next, ...rest] = it.waitlist;
  if (!next) return { claim: null, claimant: null };
  return {
    claim: { name: next.name, contact: next.contact, claimedAt: nowIso, promoted: true },
    claimant: next.name,
    waitlist: rest,
    waiting: rest.length,
  };
}
