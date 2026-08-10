// Per-item Venmo — so a buyer can pay the specific roommate who owns an item.
// Pure + dependency-free so it unit-tests in isolation. Sellers set a handle
// (and optionally an explicit profile link) per item; the buyer sees a
// "Pay @handle on Venmo" button in the claim-confirmation state.

export interface VenmoInput {
  handle?: string | null;
  link?: string | null;
}

export interface Venmo {
  /** Handle without a leading "@" (e.g. "theMayowa"). Null when unset. */
  handle: string | null;
  /** Absolute profile link (https://venmo.com/u/<handle>). Null when unset. */
  link: string | null;
}

/**
 * Normalize a seller-entered handle/link pair for storage.
 *  - handle: trimmed, leading "@" stripped; null if empty.
 *  - link: canonicalized to https://venmo.com/u/<username> — the profile URL
 *    that deep-links into the Venmo app on mobile. The username comes from the
 *    handle, or is extracted from an explicit venmo.com link (tolerating a
 *    missing /u/ or a leading @). A non-venmo URL is kept as-is (scheme
 *    prepended). Null when neither handle nor link is present.
 */
export function normalizeVenmo({ handle, link }: VenmoInput): Venmo {
  const h = (handle ?? "").trim().replace(/^@+/, "").trim();
  const rawLink = (link ?? "").trim();

  const cleanHandle = h || null;

  // Prefer the handle; otherwise pull the username out of a venmo.com link
  // (with or without the /u/ segment, tolerating a leading @).
  let username = cleanHandle;
  if (!username && rawLink) {
    const m = rawLink.match(/venmo\.com\/(?:u\/)?@?([A-Za-z0-9_.-]+)/i);
    if (m) username = m[1];
  }

  let cleanLink: string | null = null;
  if (username) {
    cleanLink = `https://venmo.com/u/${username}`;
  } else if (rawLink) {
    cleanLink = /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;
  }

  return { handle: cleanHandle, link: cleanLink };
}

/** The tappable pay href for an item, or null if it has no Venmo set. */
export function venmoPayHref(v: VenmoInput): string | null {
  return normalizeVenmo(v).link;
}

/** Display label like "@theMayowa", or null when there's no handle. */
export function venmoDisplayHandle(v: VenmoInput): string | null {
  const { handle } = normalizeVenmo(v);
  return handle ? `@${handle}` : null;
}
