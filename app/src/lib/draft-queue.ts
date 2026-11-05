// Pure helpers for the draft queue (/sell/[id]/drafts): when a draft is ready
// to publish, the conditions the card offers, and folding a confirmed brand
// guess into the name.

import { isPlaceholderName } from "./ai-draft";
import type { ItemCondition } from "./format";

/** The card offers three; photos hide wear, so the seller picks. */
export const QUEUE_CONDITIONS = ["like_new", "good", "fair"] as const satisfies readonly ItemCondition[];

export interface ReadyFields {
  photoUrls: string[];
  name: string;
  condition: string | null;
  priceCents: number | null;
  isFree: boolean;
}

/** What's still missing before a draft can go live; empty means ready. */
export function missingForPublish(d: ReadyFields): string[] {
  const missing: string[] = [];
  if (d.photoUrls.length === 0) missing.push("a photo");
  if (!d.name.trim() || isPlaceholderName(d.name)) missing.push("a name");
  if (!d.condition) missing.push("a condition");
  if (!d.isFree && d.priceCents == null) missing.push("a price");
  return missing;
}

export const isReady = (d: ReadyFields) => missingForPublish(d).length === 0;

/** "Grey 3-seat sofa" + "IKEA Kivik" -> "IKEA Kivik grey 3-seat sofa". A name
 *  that already mentions the brand is left alone. */
export function withBrand(name: string, brand: string): string {
  const b = brand.trim();
  const n = name.trim();
  if (!b || n.toLowerCase().includes(b.toLowerCase())) return n;
  if (!n || isPlaceholderName(n)) return b;
  // Lowercase a sentence-case first word ("Grey"), not an acronym ("LED").
  const rest = /^[A-Z][a-z]/.test(n) ? n[0].toLowerCase() + n.slice(1) : n;
  return `${b} ${rest}`.slice(0, 80);
}
