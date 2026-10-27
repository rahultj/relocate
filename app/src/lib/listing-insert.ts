// Insert a listing under a freshly minted slug, retrying on collision.
// Shared by every path that creates a listing (/sell, /seller/add).

import { mintSlug } from "@/lib/slug";

// Retry a slug-minting insert on unique-violation (Postgres 23505).
export async function insertWithUniqueSlug<T>(
  attempt: (slug: string) => Promise<T>,
  slugLen = 4,
  maxTries = 8,
): Promise<T> {
  for (let i = 0; i < maxTries; i++) {
    try {
      return await attempt(mintSlug(slugLen));
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "23505" && i < maxTries - 1) continue; // collision, retry
      throw err;
    }
  }
  throw new Error("Could not mint a unique slug after several attempts.");
}
