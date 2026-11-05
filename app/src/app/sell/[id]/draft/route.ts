// POST /sell/[id]/draft { itemId } — AI-draft one draft item from its photos
// and note. A route handler rather than a server action: Next runs a page's
// actions one at a time, and a ~4s model call would hold up the next photo's
// createDraftItem. Capability = listing UUID, as for the actions. AI failures
// never surface to the seller; the item keeps its "Item N" name.

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { items, listings } from "@/db/schema";
import { listingCurrency } from "@/lib/money";
import { photoList } from "@/lib/photos";
import {
  DRAFT_MODEL,
  applyDraft,
  draftSignature,
  isStoragePhoto,
  type StoredDraft,
} from "@/lib/ai-draft";
import { runDraft } from "@/lib/ai-draft-run";

export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { itemId?: unknown } | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  if (!UUID_RE.test(id) || !UUID_RE.test(itemId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [row] = await db
    .select({ item: items, currency: listings.currency })
    .from(items)
    .innerJoin(listings, eq(listings.id, items.listingId))
    .where(and(eq(items.id, itemId), eq(items.listingId, id), eq(items.draft, true)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { item } = row;

  const photos = photoList(item).filter((u) =>
    isStoragePhoto(u, process.env.NEXT_PUBLIC_SUPABASE_URL),
  );
  if (photos.length === 0) return NextResponse.json({ name: item.name });

  const signature = draftSignature(photos, item.sellerNote);
  const prev = item.aiDraft as StoredDraft | null;
  if (prev?.signature === signature && !prev.error) {
    return NextResponse.json({ name: item.name });
  }

  const base = { signature, model: DRAFT_MODEL, at: new Date().toISOString() };
  try {
    const result = await runDraft(photos, item.sellerNote ?? "", listingCurrency(row));
    const patch = applyDraft(item, prev?.result, result);
    const stored: StoredDraft = { ...base, result };
    await db
      .update(items)
      .set({ ...patch, aiDraft: stored })
      .where(and(eq(items.id, item.id), eq(items.draft, true)));
    return NextResponse.json({ name: patch.name ?? item.name });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`AI draft failed for item ${item.id}:`, error);
    const stored: StoredDraft = { ...base, error, result: prev?.result };
    await db
      .update(items)
      .set({ aiDraft: stored })
      .where(and(eq(items.id, item.id), eq(items.draft, true)))
      .catch(() => {});
    return NextResponse.json({ name: item.name, error: true }, { status: 502 });
  }
}
