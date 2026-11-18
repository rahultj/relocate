// The frame every seller tab shares (designs "A", "C", "D"): the sale's title
// and facts, the public link bar, and the Items · Claims · Sale tabs. All three
// tabs come in at once; SellerTabs shows the one the address names.

import { formatDate } from "@/lib/format";
import { currencySymbol, listingCurrency } from "@/lib/money";
import type { LoadedSale } from "@/lib/seller-data";
import type { SellerTab } from "@/lib/seller-tabs";
import { LinkBar } from "./link-bar";
import { SellerTabs } from "./seller-tabs";

export function SellerShell({
  sale,
  panels,
}: {
  sale: LoadedSale;
  panels: Record<SellerTab, React.ReactNode>;
}) {
  const { listing, published, claimsCount, origin } = sale;
  const currency = listingCurrency(listing);
  const place = [listing.city, listing.neighborhood].filter(Boolean).join(", ");
  const labels: Record<SellerTab, string> = {
    items: `Items · ${published.length}`,
    claims: `Claims · ${claimsCount}`,
    sale: "Sale",
  };

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

        <SellerTabs base={`/sell/${listing.id}`} labels={labels} panels={panels} />
      </div>
    </main>
  );
}
