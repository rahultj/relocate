// Seller home — /sell/[id]. The one link a seller keeps; the listing UUID is
// the capability, as on /manage/[id]. Sale details, the camera loop and its
// drafts; the full seller home (slice 8) lands here later.

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { db } from "@/db";
import { items, listings } from "@/db/schema";
import { listingCurrency, currencySymbol } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { photoList } from "@/lib/photos";
import { CameraLoop } from "./camera-loop";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Your sale · mustgo" };

export default async function SellerHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound(); // avoid a DB error on a non-UUID path

  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);
  if (!listing) notFound();

  const drafts = await db
    .select()
    .from(items)
    .where(and(eq(items.listingId, listing.id), eq(items.draft, true)))
    .orderBy(asc(items.createdAt));

  const currency = listingCurrency(listing);
  const place = [listing.city, listing.neighborhood].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-bg-main">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-14">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-hover">mustgo</p>
        <h1 className="mt-2.5 font-serif text-[34px] font-semibold leading-[1.05] text-text-primary">
          {listing.title}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {[
            place,
            listing.pickupFrom && `from ${formatDate(listing.pickupFrom, currency)}`,
            `prices in ${currencySymbol(currency)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div className="mt-5 rounded-xl border border-insight-border bg-insight-bg px-4 py-3.5 text-sm leading-normal text-text-primary">
          <strong className="font-bold">Bookmark this page.</strong>{" "}It&apos;s how you get
          back to your sale. There&apos;s no account, so this link is the key.
        </div>

        <CameraLoop
          listingId={listing.id}
          initialDrafts={drafts.map((d) => ({
            id: d.id,
            name: d.name,
            photoUrls: photoList(d),
            note: d.sellerNote ?? "",
          }))}
        />

        <div className="min-h-8 flex-1" />
        <Link
          href={`/manage/${listing.id}`}
          className="mt-5 flex h-12 items-center justify-between rounded-xl border border-border-weave bg-white px-4 text-[15px] font-medium text-text-primary hover:bg-bg-hover"
        >
          Manage claims &amp; items
          <ArrowRight className="size-4 text-text-secondary" aria-hidden />
        </Link>
      </div>
    </main>
  );
}
