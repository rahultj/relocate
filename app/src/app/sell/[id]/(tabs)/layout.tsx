// Seller home — /sell/[id], /sell/[id]/claims and /sell/[id]/sale: the Items,
// Claims and Sale tabs (designs "8a", "A", "C", "D"). This layout loads the
// sale once and renders all three tabs; SellerTabs shows the one the address
// names, so a tap switches on the phone without a trip to the server. The
// three pages under it are empty and only give each tab its address and
// title. The listing UUID is the capability.

import type { Category } from "@/lib/category";
import type { CsvExportItem } from "@/lib/csv";
import { listingCurrency } from "@/lib/money";
import { photoList } from "@/lib/photos";
import { loadSale } from "@/lib/seller-data";
import { SellerShell } from "../seller-shell";
import { SellerItems } from "../seller-items";
import { ClaimsView } from "../claims/claims-view";
import { SaleSettings } from "../sale/sale-settings";

export const dynamic = "force-dynamic";

const major = (cents: number | null) => (cents != null ? String(cents / 100) : "");

export default async function SellerTabsLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const sale = await loadSale(id);
  const { listing, published, drafts } = sale;
  const currency = listingCurrency(listing);

  // Download CSV: every published item (shown or hidden), in the columns the
  // importer reads back. Drafts aren't items yet.
  const exportItems: CsvExportItem[] = published.map((it) => ({
    name: it.name,
    priceText: it.isFree ? "Free" : major(it.priceCents),
    condition: it.condition,
    boughtDate: it.boughtDate,
    originalPriceText: major(it.originalPriceCents),
    availableFrom: it.availableFrom,
    category: it.category as Category | null,
    venmoHandle: it.venmoHandle ?? "",
    venmoLink: it.venmoLink ?? "",
    upiId: it.upiId ?? "",
    description: it.description,
  }));

  const items = (
    <>
      {published.length === 0 && (
        <div className="mt-4 rounded-xl border border-insight-border bg-insight-bg px-4 py-3.5 text-sm leading-normal text-text-primary">
          <strong className="font-bold">Bookmark this page.</strong>{" "}It&apos;s how you get
          back to your sale. There&apos;s no account, so this link is the key.
        </div>
      )}

      <SellerItems
        listingId={listing.id}
        slug={listing.slug}
        currency={currency}
        payDefaults={{ venmo: listing.defaultVenmoHandle, upi: listing.defaultUpiId }}
        pickupFrom={listing.pickupFrom}
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
    </>
  );

  const claims = (
    <ClaimsView listingId={listing.id} currency={currency} initialItems={published} />
  );

  const saleTab = (
    <SaleSettings
      id={listing.id}
      slug={listing.slug}
      title={listing.title}
      intro={listing.intro ?? ""}
      sellerContacts={listing.sellerContacts ?? []}
      city={listing.city ?? ""}
      neighborhood={listing.neighborhood ?? ""}
      pickupFrom={listing.pickupFrom ?? ""}
      pickupTo={listing.pickupTo ?? ""}
      currency={currency}
      payDefault={(currency === "INR" ? listing.defaultUpiId : listing.defaultVenmoHandle) ?? ""}
      exportItems={exportItems}
    />
  );

  return (
    <>
      <SellerShell sale={sale} panels={{ items, claims, sale: saleTab }} />
      {children}
    </>
  );
}
