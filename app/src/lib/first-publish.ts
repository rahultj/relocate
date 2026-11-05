// The "Almost live" step before a sale's first item goes live: how buyers
// reach the seller, plus an optional sale-wide Venmo (USD) or UPI ID (INR).
// Pure + dependency-free so it unit-tests in isolation.

import { normalizeContact } from "./contact";
import type { Currency } from "./money";
import type { SellerContact } from "./seller-contact";
import { isValidUpi, normalizeUpi } from "./upi";

/** A sale needs the step until it has at least one usable contact. */
export function needsFirstPublish(contacts: SellerContact[] | null | undefined): boolean {
  return !(contacts ?? []).some((c) => normalizeContact(c.value ?? "") != null);
}

/** The fixed country prefix shown beside the phone field. */
export const phonePrefix = (currency: Currency) => (currency === "INR" ? "+91" : "+1");

export interface FirstPublishForm {
  name: string;
  /** Which field the seller filled: the phone box or "use an email instead". */
  via: "phone" | "email";
  phone: string;
  email: string;
  /** Venmo username on USD sales, UPI ID on INR sales. Optional. */
  pay: string;
}

export type FirstPublishField = "phone" | "email" | "pay";

export type ParsedFirstPublish =
  | {
      ok: true;
      contact: SellerContact;
      defaultVenmoHandle: string | null;
      defaultUpiId: string | null;
    }
  | { ok: false; field: FirstPublishField; error: string };

// Venmo usernames: letters, digits, "-" and "_", 5–30 long. A little looser
// here so an older or odd handle isn't refused.
const VENMO_RE = /^[A-Za-z0-9_-]{2,30}$/;

export function parseFirstPublish(f: FirstPublishForm, currency: Currency): ParsedFirstPublish {
  const name = f.name.trim().slice(0, 40) || undefined;

  let value: string;
  if (f.via === "email") {
    const email = f.email.trim();
    if (normalizeContact(email)?.type !== "email") {
      return { ok: false, field: "email", error: "Enter an email like you@example.com." };
    }
    value = email.toLowerCase();
  } else {
    const phone = f.phone.trim();
    // A number typed with its own "+country" keeps it; otherwise the prefix applies.
    const full = phone.startsWith("+") ? phone : `${phonePrefix(currency)} ${phone}`;
    const n = normalizeContact(full);
    if (!phone || n?.type !== "phone" || n.contact.replace(/\D/g, "").length < 8) {
      return { ok: false, field: "phone", error: "Enter your phone number." };
    }
    value = full.replace(/\s+/g, " ");
  }

  let defaultVenmoHandle: string | null = null;
  let defaultUpiId: string | null = null;
  const pay = f.pay.trim();
  if (pay && currency === "USD") {
    const handle = pay.replace(/^@+/, "").replace(/^(https?:\/\/)?(www\.)?venmo\.com\/(u\/)?@?/i, "");
    if (!VENMO_RE.test(handle)) {
      return { ok: false, field: "pay", error: "That doesn't look like a Venmo username." };
    }
    defaultVenmoHandle = handle;
  } else if (pay) {
    if (!isValidUpi(pay)) {
      return { ok: false, field: "pay", error: "Enter a UPI ID like name@okaxis." };
    }
    defaultUpiId = normalizeUpi(pay);
  }

  return { ok: true, contact: { name, value, primary: true }, defaultVenmoHandle, defaultUpiId };
}
