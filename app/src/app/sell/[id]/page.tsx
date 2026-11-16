// Seller home — /sell/[id], the Items tab (designs "8a" and "A · Items tab").
// The one link a seller keeps; the listing UUID is the capability. The drafts
// banner, the live item list (tap one to edit it in a sheet) and Add items.
// Claims and Sale are sibling tabs at /claims and /sale.

import { listingCurrency } from "@/lib/money";
import { photoList } from "@/lib/photos";
import { loadSale } from "@/lib/seller-data";
import { SellerShell } from "./seller-shell";
import { SellerItems } from "./seller-items";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your sale · mustgo" };

export default async function SellerHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await loadSale(id);
  const { listing, published, drafts } = sale;

  return (
    <SellerShell sale={sale} active="items">
      {published.length === 0 && (
        <div className="mt-4 rounded-xl border border-insight-border bg-insight-bg px-4 py-3.5 text-sm leading-normal text-text-primary">
          <strong className="font-bold">Bookmark this page.</strong>{" "}It&apos;s how you get
          back to your sale. There&apos;s no account, so this link is the key.
        </div>
      )}

      <SellerItems
        listingId={listing.id}
        slug={listing.slug}
        currency={listingCurrency(listing)}
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
    </SellerShell>
  );
}
