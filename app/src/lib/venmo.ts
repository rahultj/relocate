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
  /** Absolute profile link (https://venmo.com/<handle>). Null when unset. */
  link: string | null;
}

/**
 * Normalize a seller-entered handle/link pair for storage.
 *  - handle: trimmed, leading "@" stripped; null if empty.
 *  - link: trimmed; a scheme is prepended if missing; derived from the handle
 *    when no explicit link is given; null when neither is present.
 */
export function normalizeVenmo({ handle, link }: VenmoInput): Venmo {
  const h = (handle ?? "").trim().replace(/^@+/, "").trim();
  const rawLink = (link ?? "").trim();

  const cleanHandle = h || null;
  let cleanLink: string | null = null;
  if (rawLink) {
    cleanLink = /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;
  } else if (cleanHandle) {
    cleanLink = `https://venmo.com/${cleanHandle}`;
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
