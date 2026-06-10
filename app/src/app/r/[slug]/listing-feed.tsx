"use client";

// Buyer-facing item feed for /r/[slug]. Filters run client-side over the
// already-fetched items: two native <select> dropdowns (Category + Availability)
// plus a "Free only" toggle. Native selects are the minimal, on-brand way to do
// this — they render as the OS picker on mobile. Rows link to the detail page.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatMonthDay } from "@/lib/format";
import { CATEGORIES } from "@/lib/category";
import { joinWaitlist, type WaitlistResult } from "./[itemId]/actions";

const BUYER_KEY = "mustgo_buyer";
const WAITLIST_KEY = "mustgo_waitlist";

interface Buyer { name: string; contact: string; }

function readBuyer(): Buyer | null {
  try {
    const raw = localStorage.getItem(BUYER_KEY);
    return raw ? (JSON.parse(raw) as Buyer) : null;
  } catch { return null; }
}

function readWaitlist(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WAITLIST_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch { return {}; }
}

export interface FeedItem {
  id: string; // UUID — used for localStorage keys + server actions
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

const OTHER = "Other";

// ---- availability: the listing's actual "available from" dates ----
// Rather than synthetic relative windows, the dropdown lists the real dates
// items free up on (the seller stages the move date by date). Each date is a
// distinct cohort, so the options partition the set. `avail` holds "any",
// "now" (ready today/past or undated), or an exact ISO date.
type Avail = "any" | "now" | (string & {});

const TODAY_ISO = new Date().toISOString().slice(0, 10);

// Effective "ready" date: no date means it's ready today.
const readyBy = (it: FeedItem) => it.availableFrom ?? TODAY_ISO;
const isReadyNow = (it: FeedItem) => readyBy(it) <= TODAY_ISO;

function matchesAvail(it: FeedItem, a: Avail): boolean {
  if (a === "any") return true;
  if (a === "now") return isReadyNow(it);
  return it.availableFrom === a; // exact future date cohort
}

const catKey = (it: FeedItem) =>
  it.category && (CATEGORIES as readonly string[]).includes(it.category)
    ? it.category
    : OTHER;

export function ListingFeed({
  slug,
  items,
  listingId,
}: {
  slug: string;
  items: FeedItem[];
  listingId: string;
}) {
  const [cat, setCat] = useState<string>("all");
  const [avail, setAvail] = useState<Avail>("any");
  const [freeOnly, setFreeOnly] = useState(false);

  const shown = useMemo(
    () =>
      items
        .filter(
          (it) =>
            (cat === "all" || catKey(it) === cat) &&
            matchesAvail(it, avail) &&
            (!freeOnly || it.isFree || it.priceCents == null),
        )
        // Soonest-available first. `readyBy` maps undated/past items to today,
        // so "available now" leads (the server's nulls-last sort would bury
        // them otherwise). Grouping preserves this order within each category.
        .sort((a, b) => readyBy(a).localeCompare(readyBy(b))),
    [items, cat, avail, freeOnly],
  );

  // Category dropdown lists only the categories actually present (canonical
  // order, Other last).
  const catOptions = useMemo(() => {
    const present = new Set(items.map(catKey));
    return [...CATEGORIES, OTHER].filter((c) => present.has(c));
  }, [items]);

  // Availability options built from the listing's real dates: "Available now"
  // (ready today/past or undated) + one option per distinct future date,
  // ascending.
  const availOptions = useMemo(() => {
    const hasNow = items.some(isReadyNow);
    const futureDates = new Set<string>();
    for (const it of items)
      if (it.availableFrom && it.availableFrom > TODAY_ISO)
        futureDates.add(it.availableFrom);
    const opts: { key: Avail; label: string }[] = [
      { key: "any", label: "Availability" },
    ];
    if (hasNow) opts.push({ key: "now", label: "Available now" });
    for (const date of [...futureDates].sort())
      opts.push({ key: date, label: `From ${formatMonthDay(date)}` });
    return opts;
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
          aria-label="Filter by availability"
          value={avail}
          onChange={(e) => setAvail(e.target.value as Avail)}
          className={selectCls}
        >
          {availOptions.map((o) => (
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
            <ItemRow key={it.slug} item={it} listingSlug={slug} listingId={listingId} />
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
                  <ItemRow key={it.slug} item={it} listingSlug={slug} listingId={listingId} />
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
  listingId,
}: {
  item: FeedItem;
  listingSlug: string;
  listingId: string;
}) {
  const claimed = it.status !== "listed";
  const future = it.availableFrom && it.availableFrom > TODAY_ISO;

  return (
    // border-b on <li> so the waitlist CTA row (outside <Link>) stays inside the border
    <li className="border-b border-border-weave">
      <Link
        href={`/r/${listingSlug}/${it.slug}`}
        className="flex items-start gap-3.5 px-6 py-3.5 transition-colors hover:bg-bg-card"
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

      {/* Waitlist CTA — outside <Link> so it doesn't trigger navigation */}
      {claimed && (
        <div className="flex items-center gap-3.5 px-6 pb-3">
          {/* spacer aligns the CTA with the body text (thumb width) */}
          <div className="size-[72px] shrink-0" aria-hidden />
          <WaitlistCta
            listingId={listingId}
            itemId={it.id}
            itemSlug={it.slug}
            listingSlug={listingSlug}
          />
        </div>
      )}
    </li>
  );
}

function WaitlistCta({
  listingId,
  itemId,
  itemSlug,
  listingSlug,
}: {
  listingId: string;
  itemId: string;
  itemSlug: string;
  listingSlug: string;
}) {
  const [joined, setJoined] = useState(false);
  const [position, setPosition] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const pos = readWaitlist()[itemId];
    if (pos != null) {
      setPosition(pos);
      setJoined(true);
    }
  }, [itemId]);

  if (joined) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ochre/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-ochre">
        Waitlisted{position != null ? ` · #${position}` : ""}
      </span>
    );
  }

  const handleJoin = async () => {
    const buyer = readBuyer();
    if (!buyer) {
      // No remembered identity — send to detail page for the full form.
      window.location.href = `/r/${listingSlug}/${itemSlug}`;
      return;
    }
    setBusy(true);
    let res: WaitlistResult;
    try {
      res = await joinWaitlist(listingId, itemId, buyer.name, buyer.contact);
    } catch {
      res = { ok: false, reason: "invalid" };
    }
    setBusy(false);
    if (res.ok) {
      try {
        const w = readWaitlist();
        w[itemId] = res.position;
        localStorage.setItem(WAITLIST_KEY, JSON.stringify(w));
      } catch { /* non-fatal */ }
      setPosition(res.position);
      setJoined(true);
    } else {
      // Anything else (error, race, available) → hand off to the detail page.
      window.location.href = `/r/${listingSlug}/${itemSlug}`;
    }
  };

  return (
    <button
      type="button"
      onClick={handleJoin}
      disabled={busy}
      className="text-[11px] font-medium text-brand underline-offset-2 hover:underline disabled:opacity-60"
    >
      {busy ? "Joining…" : "Join the waitlist →"}
    </button>
  );
}

// Native select, styled minimal + on-brand. Keep the platform's native caret
// (truly zero-fuss, always correct on mobile) and just brand the chrome.
const selectCls =
  "shrink-0 cursor-pointer rounded-full border border-border-alt bg-bg-main py-1.5 pl-3 pr-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover focus:outline-none focus:ring-2 focus:ring-ring/40";
