// Match photos by filename — /sell/[id]/photos (moved from /manage's
// "Import & tools").

import { loadSale } from "@/lib/seller-data";
import { ToolFrame } from "../tool-frame";
import { PhotoMatcher } from "./photo-matcher";

export const dynamic = "force-dynamic";

export const metadata = { title: "Match photos · mustgo" };

export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { listing, published } = await loadSale(id);
  return (
    <ToolFrame
      listingId={listing.id}
      title="Match photos by filename"
      intro={
        <>
          Name photo files like the item (<span className="font-medium text-text-primary">orange couch.jpg</span>) and
          they&apos;re matched for you. Fix any that are wrong before you attach. Photos are added after the ones an item
          already has.
        </>
      }
    >
      <PhotoMatcher
        listingId={listing.id}
        items={[...published]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((it) => ({ id: it.id, name: it.name, photoUrls: it.photoUrls }))}
      />
    </ToolFrame>
  );
}
