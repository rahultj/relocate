// Spreadsheet import and photo matching on /sell (moved from /manage). Pure so
// they unit-test. Same rules as /manage:
//   - A row whose name matches an item (ignoring case and spacing) updates it;
//     other rows become new items, hidden from buyers until the seller shows
//     them. Blank cells never overwrite, re-import never deletes, and photos
//     aren't touched.
//   - Photos are matched to items by filename ("orange couch.jpg" → Orange couch).

import type { ItemDraft } from "./csv";
import { parsePriceToCents } from "./format";
import { parsePriceField } from "./item-save";
import type { HomeItem } from "./seller-home";

// The row shape updateListing takes (see app/manage/[id]/actions.ts).
export interface ImportRow {
  itemId: string | null;
  name: string;
  description: string | null;
  condition: HomeItem["condition"];
  priceCents: number | null;
  isFree: boolean;
  boughtDate: string | null;
  originalPriceCents: number | null;
  originalBoxIncluded: boolean | null;
  availableFrom: string | null;
  category: string | null;
  venmoHandle: string | null;
  venmoLink: string | null;
  upiId: string | null;
  listed: boolean;
  photoDataUrl: null;
}

export const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function fromItem(it: HomeItem): ImportRow {
  return {
    itemId: it.id,
    name: it.name,
    description: it.description,
    condition: it.condition,
    priceCents: it.isFree ? null : it.priceCents,
    isFree: it.isFree,
    boughtDate: it.boughtDate,
    originalPriceCents: it.originalPriceCents,
    originalBoxIncluded: it.originalBoxIncluded,
    availableFrom: it.availableFrom,
    category: it.category,
    venmoHandle: it.venmoHandle,
    venmoLink: it.venmoLink,
    upiId: it.upiId,
    listed: it.listed,
    photoDataUrl: null,
  };
}

/** Fold a spreadsheet row onto a row: only cells with a value overwrite. */
function merge(row: ImportRow, d: ItemDraft): ImportRow {
  const price = d.priceText.trim() ? parsePriceField(d.priceText) : null;
  const original = d.originalPriceText.trim() ? parsePriceToCents(d.originalPriceText) : null;
  return {
    ...row,
    name: d.name.trim() || row.name,
    description: d.description.trim() || row.description,
    condition: d.condition ?? row.condition,
    priceCents: price ? price.priceCents : row.priceCents,
    isFree: price ? price.isFree : row.isFree,
    boughtDate: d.boughtDate ?? row.boughtDate,
    originalPriceCents: original ?? row.originalPriceCents,
    originalBoxIncluded: d.originalBoxIncluded ?? row.originalBoxIncluded,
    availableFrom: d.availableFrom || row.availableFrom,
    category: d.category ?? row.category,
    venmoHandle: d.venmoHandle.trim() || row.venmoHandle,
    venmoLink: d.venmoLink.trim() || row.venmoLink,
    upiId: d.upiId.trim() || row.upiId,
  };
}

function blank(defaultAvailableFrom: string | null): ImportRow {
  return {
    itemId: null,
    name: "",
    description: null,
    condition: null,
    priceCents: null,
    isFree: true,
    boughtDate: null,
    originalPriceCents: null,
    originalBoxIncluded: null,
    availableFrom: defaultAvailableFrom,
    category: null,
    venmoHandle: null,
    venmoLink: null,
    upiId: null,
    listed: false, // imported items wait, hidden, until the seller shows them
    photoDataUrl: null,
  };
}

export interface ImportPlan {
  rows: ImportRow[]; // only new and changed items, so big sales stay fast
  added: number;
  updated: number;
}

export function planImport(
  existing: HomeItem[],
  incoming: ItemDraft[],
  defaultAvailableFrom: string | null,
): ImportPlan {
  const rows = existing.map(fromItem);
  const before = rows.map((r) => JSON.stringify(r));
  const byName = new Map<string, number>();
  rows.forEach((r, i) => {
    const k = normName(r.name);
    if (k && !byName.has(k)) byName.set(k, i);
  });

  for (const d of incoming) {
    const k = normName(d.name);
    if (!k) continue;
    const idx = byName.get(k);
    if (idx != null) rows[idx] = merge(rows[idx], d);
    else {
      rows.push(merge(blank(defaultAvailableFrom), d));
      byName.set(k, rows.length - 1);
    }
  }

  const changed = rows.filter((r, i) => (i >= before.length ? true : JSON.stringify(r) !== before[i]));
  return {
    rows: changed,
    added: changed.filter((r) => !r.itemId).length,
    updated: changed.filter((r) => r.itemId).length,
  };
}

/** "Orange_Couch-2.JPG" → "orange couch 2". */
export function normLabel(s: string, stripExt = false): string {
  let x = s.toLowerCase();
  if (stripExt) x = x.replace(/\.[a-z0-9]+$/, "");
  return x.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The item a photo's filename best matches: exact, then "name 2"-style, then partial. "" = none. */
export function suggestItem(filename: string, items: { id: string; name: string }[]): string {
  const fn = normLabel(filename, true);
  const cands = items.map((it) => ({ id: it.id, n: normLabel(it.name) })).filter((c) => c.n);
  const exact = cands.find((c) => c.n === fn);
  if (exact) return exact.id;
  const prefix = cands.filter((c) => fn.startsWith(c.n + " ")).sort((a, b) => b.n.length - a.n.length);
  if (prefix.length) return prefix[0].id;
  const part = cands
    .filter((c) => c.n.startsWith(fn) || c.n.includes(fn) || fn.includes(c.n))
    .sort((a, b) => b.n.length - a.n.length);
  return part.length ? part[0].id : "";
}
