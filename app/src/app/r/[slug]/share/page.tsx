// Share sheet — /r/[slug]/share (section 09, the distribution moment).
//
// "One sheet you can tape to the fridge." A single printable letter-sized
// sheet: the listing QR (opens the full feed) plus a per-item QR for each item
// (opens its detail page directly, for tagging items in person). The on-screen
// toolbar prints / copies; the sheet itself is print-clean.

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, items } from "@/db/schema";
import { qrSvg } from "@/lib/qr";
import { formatMonthDay } from "@/lib/format";
import { ShareToolbar } from "./share-toolbar";

export const dynamic = "force-dynamic";

async function baseUrl() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { origin: `${proto}://${host}`, host };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [listing] = await db
    .select({ title: listings.title })
    .from(listings)
    .where(eq(listings.slug, slug))
    .limit(1);
  return {
    title: listing ? `Share · ${listing.title}` : "Share · mustgo",
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.slug, slug))
    .limit(1);
  if (!listing) notFound();

  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.listingId, listing.id), eq(items.unlisted, false)))
    .orderBy(asc(items.availableFrom));

  const { origin, host } = await baseUrl();
  const listingUrl = `${origin}/r/${slug}`;
  const shortBase = `${host}/r/${slug}`;

  const listingQr = await qrSvg(listingUrl);
  const itemQrs = await Promise.all(
    rows.map((it) => qrSvg(`${origin}/r/${slug}/${it.slug}`)),
  );

  return (
    <main className="min-h-screen bg-bg-main print:bg-white">
      {/* Letter page setup for print */}
      <style>{`@media print { @page { size: letter; margin: 0.5in; } }`}</style>

      <div className="mx-auto max-w-3xl px-6 py-8 print:max-w-none print:p-0">
        {/* Toolbar — screen only */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="font-serif text-2xl font-medium text-text-primary">
              Share this sale
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Print it for the lobby or fridge, or copy the link for the group
              chat.
            </p>
          </div>
          <ShareToolbar listingUrl={listingUrl} />
        </div>

        {/* The printable sheet */}
        <div className="rounded-2xl border border-border-weave bg-bg-card p-8 print:rounded-none print:border-0 print:bg-white print:p-0">
          {/* Listing header + primary QR */}
          <div className="flex flex-col items-center text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              Scan to browse the sale
            </p>
            <h2 className="mt-2 font-serif text-3xl font-medium text-text-primary">
              {listing.title}
            </h2>
            <div
              className="mt-5 size-44 [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: listingQr }}
            />
            <p className="mt-3 font-mono text-sm text-text-secondary">
              {shortBase}
            </p>
          </div>

          {rows.length > 0 && (
            <>
              <div className="my-8 flex items-center gap-3 print:my-6">
                <span className="h-px flex-1 bg-border-alt" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                  {rows.length} {rows.length === 1 ? "item" : "items"} · scan any
                  to claim
                </span>
                <span className="h-px flex-1 bg-border-alt" />
              </div>

              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 print:grid-cols-3 print:gap-4">
                {rows.map((it, i) => {
                  const free = it.isFree || it.priceCents == null;
                  return (
                    <div
                      key={it.slug}
                      className="flex break-inside-avoid flex-col items-center rounded-xl border border-border-weave bg-bg-main p-4 text-center print:border-border-alt print:bg-white"
                    >
                      <div
                        className="size-24 [&_svg]:size-full"
                        dangerouslySetInnerHTML={{ __html: itemQrs[i] }}
                      />
                      <p className="mt-3 line-clamp-2 text-sm font-medium leading-snug text-text-primary">
                        {it.name}
                      </p>
                      <p className="mt-1 font-serif text-base text-text-primary">
                        {free ? (
                          <span className="font-sans text-xs font-medium uppercase tracking-[0.1em] text-forest">
                            Free
                          </span>
                        ) : (
                          `$${Math.round(it.priceCents! / 100)}`
                        )}
                      </p>
                      {it.availableFrom && (
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
                          {formatMonthDay(it.availableFrom)}
                        </p>
                      )}
                      <p className="mt-1.5 font-mono text-[10px] text-text-muted">
                        {shortBase}/{it.slug}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
