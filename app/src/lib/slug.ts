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
