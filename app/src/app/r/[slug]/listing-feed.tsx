"use client";

// Buyer-facing item feed for /r/[slug]. Filter pills run client-side over the
// already-fetched items (section 03: "Filter pills work client-side"). Rows
// link to the per-item detail page.

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMonthDay } from "@/lib/format";
import { CATEGORIES } from "@/lib/category";

export interface FeedItem {
  slug: string;
  name: string;
  description: string | null;
  availableFrom: string | null; // ISO
  priceCents: number | null;
  isFree: boolean;
  status: "listed" | "claimed" | "picked_up";
  photoUrl: string | null;
  category: string | null;
}

// Group items into canonical-order category sections; uncategorized items fall
// into "Other", which always sorts last. Empty categories are dropped.
function groupByCategory(
  items: FeedItem[],
): { category: string; items: FeedItem[] }[] {
  const known = new Set<string>(CATEGORIES);
  const buckets = new Map<string, FeedItem[]>();
  for (const it of items) {
    const key = it.category && known.has(it.category) ? it.category : "Other";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(it);
    else buckets.set(key, [it]);
  }
  return CATEGORIES.filter((c) => buckets.has(c)).map((c) => ({
    category: c,
    items: buckets.get(c)!,
  }));
}

type Filter = "all" | "available" | "free";

const TODAY_ISO = new Date().toISOString().slice(0, 10);

function isAvailableNow(it: FeedItem): boolean {
  if (it.status !== "listed") return false;
  // No date, or a date that has arrived, counts as available now.
  return !it.availableFrom || it.availableFrom <= TODAY_ISO;
}

export function ListingFeed({
  slug,
  items,
}: {
  slug: string;
  items: FeedItem[];
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    switch (filter) {
      case "available":
        return items.filter(isAvailableNow);
      case "free":
        return items.filter((it) => it.isFree && isAvailableNow(it));
      default:
        return items;
    }
  }, [items, filter]);

  const availableCount = useMemo(
    () => items.filter(isAvailableNow).length,
    [items],
  );

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: `All · ${items.length}` },
    { key: "available", label: `Available · ${availableCount}` },
    { key: "free", label: "Free" },
  ];

  const groups = useMemo(() => groupByCategory(shown), [shown]);
  // Suppress headers when nothing is actually categorized (a single "Other"
  // group would just be noise) — fall back to a flat list.
  const flat = groups.length <= 1 && (groups[0]?.category ?? "Other") === "Other";

  return (
    <>
      <div className="flex gap-2 overflow-x-auto border-b border-border-weave px-6 py-3">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "border-text-primary bg-text-primary text-bg-main"
                : "border-border-alt text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="px-6 py-16 text-center text-sm text-text-muted">
          {items.length === 0
            ? "No items listed yet."
            : "Nothing matches this filter."}
        </p>
      ) : flat ? (
        <ul className="flex-1">
          {shown.map((it) => (
            <ItemRow key={it.slug} item={it} listingSlug={slug} />
          ))}
        </ul>
      ) : (
        <div className="flex-1">
          {groups.map((g) => (
            <section key={g.category}>
              <h2 className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-border-weave bg-bg-main/95 px-6 pb-2 pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted backdrop-blur">
                {g.category}
                <span className="text-text-muted">· {g.items.length}</span>
              </h2>
              <ul>
                {g.items.map((it) => (
                  <ItemRow key={it.slug} item={it} listingSlug={slug} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function ItemRow({
  item: it,
  listingSlug,
}: {
  item: FeedItem;
  listingSlug: string;
}) {
  const claimed = it.status !== "listed";
  const future = it.availableFrom && it.availableFrom > TODAY_ISO;

  return (
    <li>
      <Link
        href={`/r/${listingSlug}/${it.slug}`}
        className="flex items-start gap-3.5 border-b border-border-weave px-6 py-3.5 transition-colors hover:bg-bg-card"
      >
        {/* Thumb */}
        <div
          className={`relative grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-[10px] border border-border-weave bg-bg-card ${
            claimed ? "opacity-60" : ""
          }`}
        >
          {it.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={it.photoUrl}
              alt={it.name}
              className="size-full object-cover"
            />
          ) : (
            <span className="font-serif text-2xl text-text-muted">
              {it.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium leading-snug text-text-primary">
            {it.name}
          </h2>
          {it.description && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-secondary">
              {it.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.02em] text-text-muted">
            {claimed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-muted">
                Claimed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-forest">
                <span className="size-1.5 rounded-full bg-current" />
                {future ? `Available ${formatMonthDay(it.availableFrom!)}` : "Available now"}
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <div
          className={`shrink-0 text-right font-serif text-lg font-medium leading-tight tracking-tight ${
            claimed ? "text-text-muted" : "text-text-primary"
          }`}
        >
          {it.isFree || it.priceCents == null ? (
            // Match the priced treatment (serif, same size) so the price column
            // reads as one system; forest keeps "Free" as a positive signal.
            <span className={claimed ? "" : "text-forest"}>Free</span>
          ) : (
            <>
              <span className="text-[13px] text-text-muted">$</span>
              {Math.round(it.priceCents / 100)}
            </>
          )}
        </div>
      </Link>
    </li>
  );
}
