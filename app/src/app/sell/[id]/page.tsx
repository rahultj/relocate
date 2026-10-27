// Seller home — /sell/[id]. The one link a seller keeps; the listing UUID is
// the capability, as on /manage/[id]. Slice 3 stub: sale details and the way
// back. The camera loop (slice 4) and the real home (slice 8) land here.

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowRight, Camera } from "lucide-react";
import { db } from "@/db";
import { listings } from "@/db/schema";
import { listingCurrency, currencySymbol } from "@/lib/money";
import { formatDate } from "@/lib/format";

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

        <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-alt px-5 py-10 text-center">
          <Camera className="size-7 text-text-muted" aria-hidden />
          <p className="font-serif text-2xl font-semibold text-text-primary">Camera comes next</p>
          <p className="text-sm leading-normal text-text-secondary">
            Snapping photos of your items is the next step we&apos;re building. For now, add
            items in Manage.
          </p>
        </div>

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
