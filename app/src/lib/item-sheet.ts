// Item sheet on the seller home (/sell/[id], design "B · Tap an item"). The
// pure parts: which condition buttons show, the "Paid to" summary, month
// inputs for the bought date, and photo edits. Kept free of React and server
// imports so they unit-test.

import type { ItemCondition } from "./format";
import { normalizeVenmo } from "./venmo";
import { normalizeUpi } from "./upi";
import type { Currency } from "./money";

/** The sheet's condition buttons, as drawn. */
export const SHEET_CONDITIONS = ["like_new", "good", "fair", "worn"] as const satisfies readonly ItemCondition[];

/** "New" only shows on an item that already has it (CSV imports), so it isn't lost. */
export function sheetConditions(current: ItemCondition | null): ItemCondition[] {
  return current === "new" ? ["new", ...SHEET_CONDITIONS] : [...SHEET_CONDITIONS];
}

/** The Venmo username an item pays to, from its handle or its venmo.com link. */
export function venmoUsername(v: { venmoHandle: string | null; venmoLink: string | null }): string | null {
  const { handle, link } = normalizeVenmo({ handle: v.venmoHandle, link: v.venmoLink });
  if (handle) return handle;
  const m = link?.match(/venmo\.com\/u\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/** The "Paid to" row's summary: the item's own handle or ID, else the sale default. */
export function paidToSummary(
  item: { venmoHandle: string | null; venmoLink: string | null; upiId: string | null },
  defaults: { venmo: string | null; upi: string | null },
  currency: Currency,
): string {
  if (currency === "INR") {
    const own = normalizeUpi(item.upiId);
    if (own) return `UPI ${own}`;
    const def = normalizeUpi(defaults.upi);
    return def ? `UPI ${def} (sale default)` : "Not set";
  }
  const own = venmoUsername(item);
  if (own) return `Venmo @${own}`;
  const def = normalizeVenmo({ handle: defaults.venmo, link: null }).handle;
  return def ? `Venmo @${def} (sale default)` : "Not set";
}

/** ISO date "2022-03-15" -> month input value "2022-03". */
export function isoToMonth(iso: string | null): string {
  return iso && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : "";
}

/** Month input value "2022-03" -> ISO date "2022-03-01"; "" -> null. */
export function monthToIso(month: string): string | null {
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : null;
}

/** Remove one photo. The last photo stays: every published item keeps one. */
export function removePhoto(urls: string[], url: string): string[] {
  if (urls.length <= 1) return urls;
  return urls.filter((u) => u !== url);
}

/** Move a photo to the front; the first photo is the cover. */
export function makeCover(urls: string[], url: string): string[] {
  if (!urls.includes(url)) return urls;
  return [url, ...urls.filter((u) => u !== url)];
}
