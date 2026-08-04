// Multi-photo helpers. `photoUrls` (ordered) is the source of truth; the first
// entry is the cover. The legacy single `photoUrl` column is kept in sync as a
// mirror of the cover so the feed/manage thumbnails need no change. Pure so it
// unit-tests in isolation.

export const MAX_PHOTOS = 8;

/** DB columns for a set of photo URLs: the array + the synced cover mirror. */
export function photoColumns(urls: string[]): {
  photoUrls: string[];
  photoUrl: string | null;
} {
  const clean = urls.map((u) => u.trim()).filter(Boolean).slice(0, MAX_PHOTOS);
  return { photoUrls: clean, photoUrl: clean[0] ?? null };
}

/** Reconcile a possibly-legacy row into an ordered photo list (cover first). */
export function photoList(row: {
  photoUrls?: string[] | null;
  photoUrl?: string | null;
}): string[] {
  const arr = (row.photoUrls ?? []).filter(Boolean);
  if (arr.length > 0) return arr;
  return row.photoUrl ? [row.photoUrl] : [];
}
