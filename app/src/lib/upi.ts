// Per-item UPI — the India-sale counterpart to lib/venmo.ts. Pure +
// dependency-free so it unit-tests in isolation. A seller sets a UPI ID
// (name@bank) per item or as the sale default; the buyer sees a
// "Pay ₹X with UPI" button plus a copy fallback in the claim-confirmation state.
//
// A UPI ID contains "@", so it must never go through normalizeContact (which
// would treat it as an email).

// name@handle: the name part allows letters, digits, ".", "_" and "-"; the
// handle is the bank / app suffix (okhdfcbank, ybl, paytm…).
const UPI_RE = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,64}$/;

/**
 * Normalize a seller-entered UPI ID for storage: trimmed, inner spaces
 * removed, lowercased (UPI IDs are case-insensitive). Null if empty. Doesn't
 * validate — a malformed ID is kept so the seller can see and fix it; use
 * isValidUpi before offering it to a buyer.
 */
export function normalizeUpi(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/\s+/g, "").toLowerCase();
  return s || null;
}

/** True when the ID looks like a real UPI ID (name@handle). */
export function isValidUpi(raw: string | null | undefined): boolean {
  const s = normalizeUpi(raw);
  return s != null && UPI_RE.test(s);
}

export interface UpiPayInput {
  id: string;
  /** Amount in paise; null or 0 leaves the amount for the buyer to enter. */
  amountMinor?: number | null;
  /** Payee name some UPI apps show before paying. */
  payeeName?: string | null;
  /** Transaction note, e.g. the item name, so the seller knows what it's for. */
  note?: string | null;
}

/**
 * upi://pay deep link, or null if the ID isn't valid. The ID's charset is
 * URL-safe, so it goes in unencoded (some apps reject "%40"); free text is
 * percent-encoded.
 */
export function upiPayHref({ id, amountMinor, payeeName, note }: UpiPayInput): string | null {
  const pa = normalizeUpi(id);
  if (!pa || !UPI_RE.test(pa)) return null;
  const parts = [`pa=${pa}`];
  const pn = payeeName?.trim();
  if (pn) parts.push(`pn=${encodeURIComponent(pn)}`);
  if (amountMinor != null && amountMinor > 0) parts.push(`am=${(amountMinor / 100).toFixed(2)}`);
  parts.push("cu=INR");
  const tn = note?.trim();
  if (tn) parts.push(`tn=${encodeURIComponent(tn.slice(0, 50))}`);
  return `upi://pay?${parts.join("&")}`;
}
