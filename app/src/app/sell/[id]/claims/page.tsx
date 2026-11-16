// Claims tab — /sell/[id]/claims (design "C · Claims tab"). Replaces the claims
// overview on /manage: who's coming for what, with Sold and Release.

import { listingCurrency } from "@/lib/money";
import { loadSale } from "@/lib/seller-data";
import { SellerShell } from "../seller-shell";
import { ClaimsView } from "./claims-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Claims · mustgo" };

export default async function ClaimsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await loadSale(id);
  return (
    <SellerShell sale={sale} active="claims">
      <ClaimsView
        listingId={sale.listing.id}
        currency={listingCurrency(sale.listing)}
        initialItems={sale.published}
      />
    </SellerShell>
  );
}
