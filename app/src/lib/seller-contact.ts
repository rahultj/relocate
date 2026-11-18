// Per-listing seller contact shape for the buyer pages' "Questions? Text Rahul" link.
//
// Multi-seller: each listing stores its own contacts in `listings.seller_contacts`
// (a jsonb array of these). There is NO hardcoded global contact — a listing with
// no contacts set simply shows no button. Set/edited by the seller on /manage.
//
// SMS is the medium (principle #2): `value` is a free-text phone or email; the
// UI derives the right href (sms:/tel: for phones, mailto: for emails) via
// `contactHref` in lib/contact.ts, so a mobile visitor taps straight into their
// messaging app and a desktop visitor can read/copy the number.

export interface SellerContact {
  /** Who this reaches (e.g. "Swati"). Optional — falls back to the value. */
  name?: string;
  /** Free-text phone or email the buyer can reach. */
  value: string;
  /** The primary person to reach — emphasized in the UI. */
  primary?: boolean;
}

/**
 * Who the buyer-facing link names: the primary contact's first name, else the
 * first named contact, else "the seller" ("Text Rahul", "Text the seller").
 */
export function contactName(contacts: SellerContact[]): string {
  const usable = contacts.filter((c) => c.value?.trim());
  const named = usable.find((c) => c.primary && c.name?.trim()) ?? usable.find((c) => c.name?.trim());
  return named?.name?.trim().split(/\s+/)[0] ?? "the seller";
}
