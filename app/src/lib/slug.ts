// 4-char slugs. base32 alphabet excludes ambiguous chars (0/O, 1/I/L, U)
// so slugs survive being read off a printed QR letter sheet. Collision is
// handled by retry-on-insert at the DB layer (see the publish action).

const ALPHABET = "abcdefghjkmnpqrstvwxyz23456789"; // 30 chars, no 0 1 i l o u

export function mintSlug(length = 4): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// ---------- Vanity slugs (seller-chosen, readable listing URLs) ----------
// A listing's /r/[slug] can be a readable word-slug instead of the minted code.
// Pure helpers so the format rules are tested + shared by client and server.

// Words that must not become a listing slug (would shadow real routes if the
// /r/ prefix were ever dropped; cheap guard regardless).
const RESERVED_SLUGS = new Set(["manage", "seller", "r", "api", "share"]);

/** Coerce free text into a slug: lowercase, non-alphanumerics → single hyphens. */
export function toVanitySlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Valid = 3–40 chars, a–z/0–9 words joined by single hyphens, not reserved. */
export function isValidVanitySlug(s: string): boolean {
  if (s.length < 3 || s.length > 40) return false;
  if (RESERVED_SLUGS.has(s)) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}
