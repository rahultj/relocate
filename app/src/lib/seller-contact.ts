// Hardcoded seller contact numbers for the "Contact us" floating button.
// Single-seller app, so no per-listing config or schema change (see CLAUDE.md
// working agreements). Swati is the primary contact.
//
// SMS is the medium (principle #2): the numbers render as visible text so a
// desktop visitor can text from their own phone, and as `sms:` links so a
// mobile visitor taps straight into their messaging app.

export interface SellerContact {
  name: string;
  /** Digits-only E.164 (with leading "+") for the sms: href. */
  e164: string;
  /** Pretty display form. */
  display: string;
  /** The primary person to reach — emphasized in the UI. */
  primary?: boolean;
}

export const SELLER_CONTACTS: SellerContact[] = [
  { name: "Swati", e164: "+16172307788", display: "+1 617 230 7788", primary: true },
  { name: "Rahul", e164: "+18572069533", display: "+1 857 206 9533" },
];
