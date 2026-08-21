"use client";

// Buyer-facing item feed for /r/[slug]. Filters run client-side over the
// already-fetched items: two native <select> dropdowns (Category + Status) plus
// a "Free only" toggle. Native selects are the minimal, on-brand way to do this
// — they render as the OS picker on mobile. Rows link to the detail page.

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
  originalPriceCents: number | null;
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

const OTHER = "Other";

// ---- status: what a buyer can still take ----
// This replaced an "availability" dropdown of real `available_from` date
// cohorts. That filter stopped earning its slot once nearly everything read
// "Available now" (and each row prints its own date badge anyway), while the
// question buyers actually ask — "what's still up for grabs?" — had no answer
// on a long listing. Keys ARE the FeedItem statuses, so matching is equality.
type Status = "all" | FeedItem["status"];

// Canonical order for the dropdown; labels match the badges ItemRow renders.
const STATUS_OPTIONS: { key: Status; label: string }[] = [
  { key: "all", label: "All items" },
  { key: "listed", label: "Available" },
  { key: "claimed", label: "Claimed" },
  { key: "picked_up", label: "Sold" },
];

const TODAY_ISO = new Date().toISOString().slice(0, 10);

// Effective "ready" date: no date means it's ready today. Still used by the
// sort's secondary key and ItemRow's per-row date badge.
const readyBy = (it: FeedItem) => it.availableFrom ?? TODAY_ISO;

const catKey = (it: FeedItem) =>
  it.category && (CATEGORIES as readonly string[]).includes(it.category)
    ? it.category
    : OTHER;

export function ListingFeed({
  slug,
  items,
}: {
  slug: string;
  items: FeedItem[];
}) {
  const [cat, setCat] = useState<string>("all");
  const [status, setStatus] = useState<Status>("all");
  const [freeOnly, setFreeOnly] = useState(false);

  const shown = useMemo(
    () =>
      items
        .filter(
          (it) =>
            (cat === "all" || catKey(it) === cat) &&
            (status === "all" || it.status === status) &&
            (!freeOnly || it.isFree || it.priceCents == null),
        )
        // Unclaimed first, then soonest-available. Claimed items sink to the
        // bottom (of the flat list, or within each category section) so buyers
        // see what they can actually take before the "Join waitlist" leftovers.
        // `readyBy` maps undated/past items to today, so "available now" leads
        // the server's nulls-last sort would bury them otherwise). Grouping
        // preserves this order within each category.
        .sort((a, b) => {
          // available (0) < claimed (1) < sold/picked_up (2), so gone-for-good
          // items sink below the claimed ones (which still offer a waitlist).
          const rank = (s: string) =>
            s === "listed" ? 0 : s === "picked_up" ? 2 : 1;
          const ra = rank(a.status);
          const rb = rank(b.status);
          if (ra !== rb) return ra - rb;
          return readyBy(a).localeCompare(readyBy(b));
        }),
    [items, cat, status, freeOnly],
  );

  // Category dropdown lists only the categories actually present (canonical
  // order, Other last).
  const catOptions = useMemo(() => {
    const present = new Set(items.map(catKey));
    // CATEGORIES already ends with "Other" (canonical order, Other last), so
    // filter it directly — don't re-append OTHER or it renders twice (dup key).
    return CATEGORIES.filter((c) => present.has(c));
  }, [items]);

  // Only offer statuses this listing actually has (same rule as catOptions) —
  // a listing with nothing sold shouldn't show a "Sold" option that can only
  // ever return "Nothing matches this filter."
  const statusOptions = useMemo(() => {
    const present = new Set<string>(items.map((it) => it.status));
    return STATUS_OPTIONS.filter((o) => o.key === "all" || present.has(o.key));
  }, [items]);

  const groups = useMemo(() => groupByCategory(shown), [shown]);
  // Flat list when a single category is selected (the dropdown already names
  // it) or when nothing is meaningfully categorized (a lone "Other" group).
  const flat =
    cat !== "all" ||
    (groups.length <= 1 && (groups[0]?.category ?? OTHER) === OTHER);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border-weave px-6 py-3">
        <select
          aria-label="Filter by category"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className={selectCls}
        >
          <option value="all">All categories</option>
          {catOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          className={selectCls}
        >
          {statusOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          aria-pressed={freeOnly}
          onClick={() => setFreeOnly((v) => !v)}
          className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            freeOnly
              ? "border-forest bg-forest/10 text-forest"
              : "border-border-alt text-text-secondary hover:bg-bg-hover"
          }`}
        >
          Free only
        </button>
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
  const sold = it.status === "picked_up";
  const claimed = it.status !== "listed"; // claimed OR sold → greyed treatment
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
            {sold ? (
              // Sold = gone for good. Clear badge, no waitlist (nothing to wait
              // for) — so browsers aren't left wondering.
              <span className="inline-flex items-center rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-muted">
                Sold
              </span>
            ) : claimed ? (
              // Claimed items aren't a dead end: surface the waitlist option
              // right here so buyers don't have to tap through to discover it.
              // The row already links to the detail page, where the join form
              // lives — this is the affordance, not a duplicate flow.
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-muted">
                  Claimed
                </span>
                <span className="font-medium text-brand">Join waitlist ›</span>
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
              {/* Struck original anchors the deal — only when it's a real
                  markdown (original > asking). Small, muted, stacked above. */}
              {it.originalPriceCents != null &&
                it.originalPriceCents > it.priceCents && (
                  <div className="font-mono text-[11px] font-normal text-text-muted">
                    Orig.{" "}
                    <span className="line-through">
                      ${Math.round(it.originalPriceCents / 100)}
                    </span>
                  </div>
                )}
              <span className="text-[13px] text-text-muted">$</span>
              {Math.round(it.priceCents / 100)}
            </>
          )}
        </div>
      </Link>
    </li>
  );
}

// Native select, styled minimal + on-brand. Keep the platform's native caret
// (truly zero-fuss, always correct on mobile) and just brand the chrome.
const selectCls =
  "shrink-0 cursor-pointer rounded-full border border-border-alt bg-bg-main py-1.5 pl-3 pr-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover focus:outline-none focus:ring-2 focus:ring-ring/40";
