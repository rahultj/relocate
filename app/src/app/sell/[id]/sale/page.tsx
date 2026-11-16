// Sale tab — /sell/[id]/sale (design "D · Sale tab"). The sale's details,
// how buyers reach the seller and get paid, the public link, and the
// spreadsheet and photo tools.

import type { CsvExportItem } from "@/lib/csv";
import { listingCurrency } from "@/lib/money";
import { loadSale } from "@/lib/seller-data";
import type { Category } from "@/lib/category";
import { SellerShell } from "../seller-shell";
import { SaleSettings } from "./sale-settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sale settings · mustgo" };

const major = (cents: number | null) => (cents != null ? String(cents / 100) : "");

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await loadSale(id);
  const { listing } = sale;
  const currency = listingCurrency(listing);

  // Download CSV: every published item (shown or hidden), in the columns the
  // importer reads back. Drafts aren't items yet.
  const exportItems: CsvExportItem[] = sale.published.map((it) => ({
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

  return (
    <SellerShell sale={sale} active="sale">
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
    </SellerShell>
  );
}
