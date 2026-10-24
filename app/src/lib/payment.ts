// How a buyer pays for a claimed item. Pure + tested. The sale's currency
// picks the method — Venmo for USD sales, UPI for INR — and the item's own
// handle / ID wins over the sale-wide default set on the listing. Free items
// have nothing to pay, so they get no payment option.

import type { Currency } from "./money";
import type { SellerContact } from "./seller-contact";
import { upiPayHref, normalizeUpi } from "./upi";
import { venmoPayHref, venmoDisplayHandle } from "./venmo";

export type Payment =
  | { kind: "venmo"; href: string; handle: string | null }
  | { kind: "upi"; href: string; id: string };

export interface PaymentListing {
  currency: Currency;
  title: string;
  sellerContacts: SellerContact[] | null;
  defaultVenmoHandle: string | null;
  defaultUpiId: string | null;
}

export interface PaymentItem {
  name: string;
  priceCents: number | null;
  isFree: boolean;
  venmoHandle: string | null;
  venmoLink: string | null;
  upiId: string | null;
}

/** The primary contact's name, else the first named contact, else the sale title. */
export function payeeName(listing: Pick<PaymentListing, "title" | "sellerContacts">): string {
  const contacts = listing.sellerContacts ?? [];
  const primary = contacts.find((c) => c.primary && c.name?.trim());
  const named = primary ?? contacts.find((c) => c.name?.trim());
  return named?.name?.trim() || listing.title;
}

/** The payment option to show after claiming, or null when free or none is set up. */
export function itemPayment(listing: PaymentListing, item: PaymentItem): Payment | null {
  if (item.isFree || !item.priceCents) return null;

  if (listing.currency === "INR") {
    const id = normalizeUpi(item.upiId) ?? normalizeUpi(listing.defaultUpiId);
    if (!id) return null;
    const href = upiPayHref({
      id,
      amountMinor: item.priceCents,
      payeeName: payeeName(listing),
      note: item.name,
    });
    return href ? { kind: "upi", href, id } : null;
  }

  const own = item.venmoHandle || item.venmoLink;
  const v = own
    ? { handle: item.venmoHandle, link: item.venmoLink }
    : { handle: listing.defaultVenmoHandle, link: null };
  const href = venmoPayHref(v);
  if (!href) return null;
  const display = venmoDisplayHandle(v);
  return { kind: "venmo", href, handle: display };
}
