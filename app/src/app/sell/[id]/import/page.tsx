// Spreadsheet import — /sell/[id]/import (moved from /manage's "Import & tools").
// ?paste=1 opens with the paste box showing.

import { loadSale } from "@/lib/seller-data";
import { ToolFrame } from "../tool-frame";
import { ImportTool } from "./import-tool";

export const dynamic = "force-dynamic";

export const metadata = { title: "Import a spreadsheet · mustgo" };

export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paste?: string }>;
}) {
  const [{ id }, { paste }] = await Promise.all([params, searchParams]);
  const { listing, published } = await loadSale(id);
  return (
    <ToolFrame
      listingId={listing.id}
      title="Import a spreadsheet"
      intro="A CSV from Google Sheets or Excel. Items with a matching name are updated; the rest are added, hidden from buyers until you show them."
    >
      <ImportTool
        sale={{
          id: listing.id,
          title: listing.title,
          city: listing.city,
          neighborhood: listing.neighborhood,
          pickupFrom: listing.pickupFrom,
          pickupTo: listing.pickupTo,
        }}
        items={published}
        startWithPaste={paste === "1"}
      />
    </ToolFrame>
  );
}
