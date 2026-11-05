// Draft queue — /sell/[id]/drafts (design: "3 · Draft queue"). One card per
// draft: check what the AI wrote, pick condition and price, publish. The
// listing UUID is the capability, as on the seller home.

import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { items, listings } from "@/db/schema";
import { listingCurrency } from "@/lib/money";
import { photoList } from "@/lib/photos";
import type { StoredDraft } from "@/lib/ai-draft";
import { DraftQueue, type QueueCard } from "./draft-queue";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Finish your drafts · mustgo" };

export default async function DraftQueuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [listing] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!listing) notFound();

  const drafts = await db
    .select()
    .from(items)
    .where(and(eq(items.listingId, listing.id), eq(items.draft, true)))
    .orderBy(asc(items.createdAt));

  const cards: QueueCard[] = drafts.map((d) => {
    const ai = d.aiDraft as StoredDraft | null;
    return {
      id: d.id,
      name: d.name,
      description: d.description ?? "",
      category: d.category,
      condition: d.condition,
      priceCents: d.priceCents,
      isFree: d.isFree,
      photoUrls: photoList(d),
      originalPriceCents: d.originalPriceCents,
      boughtDate: d.boughtDate,
      brandGuess: ai?.brandAnswer ? null : (ai?.result?.brandGuess ?? null),
      aiDrafted: ai?.result != null,
      needsDraft: ai == null || ai.error != null,
    };
  });

  return (
    <main className="min-h-dvh bg-bg-card">
      <DraftQueue
        listingId={listing.id}
        slug={listing.slug}
        title={listing.title}
        currency={listingCurrency(listing)}
        initialCards={cards}
      />
    </main>
  );
}
