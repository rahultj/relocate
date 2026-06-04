// Resolve an old listing slug to its current one. When a seller renames a
// listing, the prior slug moves into `previous_slugs`; public routes use this to
// 301-redirect old links / printed QR to the canonical URL instead of 404ing.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { listings } from "@/db/schema";

export async function canonicalSlugFor(slug: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: listings.slug })
    .from(listings)
    .where(sql`${slug} = ANY(${listings.previousSlugs})`)
    .limit(1);
  return row?.slug ?? null;
}
