// The frame every seller tab shares (designs "A", "C", "D"): the sale's title
// and facts, the public link bar, and the Items · Claims · Sale tabs.

import Link from "next/link";
import { formatDate } from "@/lib/format";
import { currencySymbol, listingCurrency } from "@/lib/money";
import type { LoadedSale } from "@/lib/seller-data";
import { LinkBar } from "./link-bar";

export type SellerTab = "items" | "claims" | "sale";

export function SellerShell({
  sale,
  active,
  children,
}: {
  sale: LoadedSale;
  active: SellerTab;
  children: React.ReactNode;
}) {
  const { listing, published, claimsCount, origin } = sale;
  const currency = listingCurrency(listing);
  const place = [listing.city, listing.neighborhood].filter(Boolean).join(", ");
  const base = `/sell/${listing.id}`;
  const tabs: { key: SellerTab; href: string; label: string }[] = [
    { key: "items", href: base, label: `Items · ${published.length}` },
    { key: "claims", href: `${base}/claims`, label: `Claims · ${claimsCount}` },
    { key: "sale", href: `${base}/sale`, label: "Sale" },
  ];

  return (
    <main className="min-h-screen bg-bg-main">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-12 md:max-w-2xl">
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

        <LinkBar url={`${origin}/r/${listing.slug}`} slug={listing.slug} title={listing.title} />

        <nav aria-label="Seller sections" className="mt-4 flex gap-6 border-b border-border-weave">
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-10 items-center border-b-2 text-[15px] ${
                  on
                    ? "border-text-primary font-bold text-text-primary"
                    : "border-transparent font-medium text-text-secondary"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </main>
  );
}
