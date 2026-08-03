// Soft-claim contact identity. The buyer types one field (email OR phone); we
// auto-detect and normalize it into the dedupe key stored on `buyers.contact`.
// Pure + dependency-free so it unit-tests in isolation. A normalization bug =
// duplicate buyers or unreachable contacts, so this is the piece worth testing.

export type ContactType = "email" | "phone";

export interface NormalizedContact {
  contact: string; // the normalized dedupe key
  type: ContactType;
}

// Loose email shape — not RFC-perfect, just enough to tell "looks like an email"
// and to reject obvious junk.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize a free-text contact into { contact, type } or null if it's neither a
 * plausible email nor a plausible phone.
 *  - has "@" → treated as email: trimmed + lowercased; must match EMAIL_RE.
 *  - else → treated as phone: keep a leading "+", strip everything non-digit;
 *    must have >= 7 digits.
 */
export function normalizeContact(raw: string): NormalizedContact | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  if (trimmed.includes("@")) {
    const email = trimmed.toLowerCase();
    return EMAIL_RE.test(email) ? { contact: email, type: "email" } : null;
  }

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return { contact: (hasPlus ? "+" : "") + digits, type: "phone" };
}

/**
 * Build a tappable href for a free-text seller contact:
 *  - phone → `sms:` (SMS is the medium — principle #2)
 *  - email → `mailto:`
 * Returns null if the value is neither a plausible phone nor email.
 */
export function contactHref(raw: string): string | null {
  const n = normalizeContact(raw);
  if (!n) return null;
  return n.type === "email" ? `mailto:${n.contact}` : `sms:${n.contact}`;
}
