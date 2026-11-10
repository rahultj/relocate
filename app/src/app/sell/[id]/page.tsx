// Seller home — /sell/[id] (design: "8a · Seller home"). The one link a seller
// keeps; the listing UUID is the capability, as on /manage/[id]. The sale's
// link, the drafts banner, the live item list and Add items. Claims and the
// sale's settings still live on /manage/[id] (the Claims and Sale tabs).

import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { buyers, claims, items, listings } from "@/db/schema";
import { listingCurrency, currencySymbol } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { photoList } from "@/lib/photos";
import { homeStatus, openClaimCount } from "@/lib/seller-home";
import { LinkBar } from "./link-bar";
import { SellerItems, type HomeItem } from "./seller-items";

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

  const [rows, claimRows, h] = await Promise.all([
    db
      .select()
      .from(items)
      .where(eq(items.listingId, listing.id))
      .orderBy(desc(items.createdAt)),
    // Confirmed claims and waitlist entries, for each item's status line.
    db
      .select({ itemId: claims.itemId, status: claims.status, name: buyers.name })
      .from(claims)
      .innerJoin(buyers, eq(claims.buyerId, buyers.id))
      .innerJoin(items, eq(claims.itemId, items.id))
      .where(eq(items.listingId, listing.id))
      .orderBy(asc(claims.position)),
    headers(),
  ]);

  const claimant = new Map<string, string>();
  const waiting = new Map<string, number>();
  for (const c of claimRows) {
    if (c.status === "confirmed") claimant.set(c.itemId, c.name ?? "");
    else if (c.status === "waitlist") waiting.set(c.itemId, (waiting.get(c.itemId) ?? 0) + 1);
  }

  const drafts = rows.filter((r) => r.draft).reverse(); // oldest first, as shot
  const published: HomeItem[] = rows
    .filter((r) => !r.draft)
    .map((r) => ({
      id: r.id,
      name: r.name,
      photoUrl: photoList(r)[0] ?? null,
      priceCents: r.priceCents,
      isFree: r.isFree,
      listed: !r.unlisted,
      sold: r.status === "picked_up",
      claimant: claimant.get(r.id) ?? null,
      waiting: waiting.get(r.id) ?? 0,
    }));
  const claimsCount = openClaimCount(published.map(homeStatus));

  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const publicUrl = `${proto}://${host}/r/${listing.slug}`;

  const currency = listingCurrency(listing);
  const place = [listing.city, listing.neighborhood].filter(Boolean).join(", ");
  const manage = `/manage/${listing.id}`;
  const tab = "flex h-10 items-center border-b-2 text-[15px]";

  return (
    <main className="min-h-screen bg-bg-main">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-12">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-hover">mustgo</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-[1.05] text-text-primary">
          {listing.title}
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          {[
            place,
            listing.pickupFrom && `from ${formatDate(listing.pickupFrom, currency)}`,
            `prices in ${currencySymbol(currency)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <LinkBar url={publicUrl} slug={listing.slug} title={listing.title} />

        <nav aria-label="Seller sections" className="mt-4 flex gap-6 border-b border-border-weave">
          <Link
            href={`/sell/${listing.id}`}
            aria-current="page"
            className={`${tab} border-text-primary font-bold text-text-primary`}
          >
            Items · {published.length}
          </Link>
          <Link href={manage} className={`${tab} border-transparent font-medium text-text-secondary`}>
            Claims · {claimsCount}
          </Link>
          <Link href={manage} className={`${tab} border-transparent font-medium text-text-secondary`}>
            Sale
          </Link>
        </nav>

        {published.length === 0 && (
          <div className="mt-4 rounded-xl border border-insight-border bg-insight-bg px-4 py-3.5 text-sm leading-normal text-text-primary">
            <strong className="font-bold">Bookmark this page.</strong>{" "}It&apos;s how you get
            back to your sale. There&apos;s no account, so this link is the key.
          </div>
        )}

        <SellerItems
          listingId={listing.id}
          currency={currency}
          initialItems={published}
          initialDrafts={drafts.map((d) => ({
            id: d.id,
            name: d.name,
            photoUrls: photoList(d),
            note: d.sellerNote ?? "",
            drafted: d.aiDraft != null && !(d.aiDraft as { error?: string }).error,
          }))}
        />

        {published.length > 0 && (
          <p className="mt-auto pb-24 pt-6 text-center text-[13px] text-text-secondary">
            Bookmark this page. It&apos;s the key to your sale.
          </p>
        )}
      </div>
    </main>
  );
}
