"use client";

// Buyer-facing item feed for /r/[slug] (design review, feed changes 3 and 5).
// A row of chips (All, Free, each category, with how many are still available)
// filters a two-column photo grid of what buyers can take, grouped under light
// category headings. Cards only label exceptions ("From Dec 15"); claimed and
// sold items fold into one line at the bottom that opens into the same grid.
// Descriptions live on the item page. Logic: lib/feed.ts.

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMonthDay } from "@/lib/format";
import { formatMoney, type Currency } from "@/lib/money";
import { feedChips, goneLabel, groupByCategory, isFreeItem, splitFeed, type FeedChip } from "@/lib/feed";

export interface FeedItem {
  slug: string;
  name: string;
  availableFrom: string | null; // ISO
  priceCents: number | null;
  originalPriceCents: number | null;
  isFree: boolean;
  status: "listed" | "claimed" | "picked_up";
  photoUrl: string | null;
  category: string | null;
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

export function ListingFeed({
  slug,
  items,
  currency,
}: {
  slug: string;
  items: FeedItem[];
  currency: Currency;
}) {
  const [chip, setChip] = useState<FeedChip>("all");
  const [showGone, setShowGone] = useState(false);

  const chips = useMemo(() => feedChips(items), [items]);
  const { available, gone } = useMemo(() => splitFeed(items, chip, TODAY_ISO), [items, chip]);
  // Headings help scan a long mixed list; one category is already named by its chip.
  const grouped = chip === "all" || chip === "free";
  const groups = useMemo(() => groupByCategory(available), [available]);
  const card = (it: FeedItem) => <Card key={it.slug} item={it} listingSlug={slug} currency={currency} />;

  if (items.length === 0) {
    return <p className="px-6 py-16 text-center text-sm text-text-muted">No items listed yet.</p>;
  }

  return (
    <>
      {chips.length > 1 && (
        <nav
          aria-label="Filter items"
          className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-border-weave bg-bg-main/95 px-6 py-3 backdrop-blur [scrollbar-width:none]"
        >
          {chips.map((c) => {
            const on = c.key === chip;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => setChip(c.key)}
                className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors ${
                  on
                    ? "border-text-primary bg-text-primary text-white"
                    : "border-border-alt bg-white text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {c.label}
                <span className={on ? "text-white/70" : "text-text-muted"}>{c.count}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="flex-1 px-6 pb-6">
        {available.length === 0 ? (
          <p className="py-12 text-center text-sm text-text-muted">Nothing here is available right now.</p>
        ) : grouped && groups.length > 1 ? (
          groups.map((g) => (
            <section key={g.category}>
              <h2 className="pb-3 pt-6 text-[15px] font-bold text-text-primary">
                {g.category}
              </h2>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-5">{g.items.map(card)}</ul>
            </section>
          ))
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 pt-5">{available.map(card)}</ul>
        )}

        {gone.length > 0 && (
          <div className="mt-8">
            <button
              type="button"
              aria-expanded={showGone}
              onClick={() => setShowGone((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-border-weave bg-bg-card px-4 py-3.5 text-left text-sm text-text-secondary"
            >
              <span>{goneLabel(gone)}</span>
              <span className="font-medium text-text-primary">{showGone ? "Hide" : "Show"}</span>
            </button>
            {showGone && <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5">{gone.map(card)}</ul>}
          </div>
        )}
      </div>
    </>
  );
}

function Card({ item: it, listingSlug, currency }: { item: FeedItem; listingSlug: string; currency: Currency }) {
  const sold = it.status === "picked_up";
  const claimed = it.status === "claimed";
  const later = it.status === "listed" && it.availableFrom && it.availableFrom > TODAY_ISO;
  const free = isFreeItem(it);
  const markdown =
    !free && it.originalPriceCents != null && it.priceCents != null && it.originalPriceCents > it.priceCents;
  // Only exceptions get a label: available now is the default and says nothing.
  const label = sold ? "Sold" : claimed ? "Claimed" : later ? `From ${formatMonthDay(it.availableFrom!, currency)}` : null;

  return (
    <li className="min-w-0">
      <Link href={`/r/${listingSlug}/${it.slug}`} className="group flex flex-col">
        <div
          className={`relative grid aspect-square place-items-center overflow-hidden rounded-xl border border-border-weave bg-bg-card ${
            sold || claimed ? "opacity-60" : ""
          }`}
        >
          {it.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.photoUrl} alt={it.name} loading="lazy" className="size-full object-cover" />
          ) : (
            <span className="font-serif text-5xl text-text-muted">{it.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        {label && (
          // Outside the dimmed photo so it stays readable.
          <span className="relative -mt-9 mb-3 ml-2 self-start rounded-full bg-bg-main/95 px-2.5 py-1 text-xs font-medium text-text-primary shadow-sm">
            {label}
          </span>
        )}
        <h3 className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-text-primary">{it.name}</h3>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 leading-tight">
          <span
            className={`font-serif text-[22px] font-semibold ${
              sold || claimed ? "text-text-muted" : free ? "text-forest" : "text-text-primary"
            }`}
          >
            {free ? "Free" : formatMoney(it.priceCents!, currency, { whole: true })}
          </span>
          {markdown && (
            <s className="text-xs text-text-muted">{formatMoney(it.originalPriceCents!, currency, { whole: true })}</s>
          )}
        </p>
        {claimed && <span className="mt-0.5 text-xs font-medium text-brand">Join waitlist ›</span>}
      </Link>
    </li>
  );
}
