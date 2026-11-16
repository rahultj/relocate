"use client";

// Claims tab (design "C · Claims tab"): what's claimed and sold, then the open
// claims by person or by item, each with Sold and Release (Release asks
// first). Sold items sit at the bottom with Undo. Tapping an item name opens
// its sheet on the Items tab.

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMoney, type Currency } from "@/lib/money";
import type { HomeItem } from "@/lib/seller-home";
import type { ActionResult } from "@/lib/with-listing";
import { claimTotals, claimsByItem, claimsByPerson, soldItems } from "@/lib/seller-claims";
import { markSold, releaseClaim, undoSold } from "@/app/manage/[id]/actions";
import { ContactLink } from "../item-sheet";

type View = "person" | "item";

export function ClaimsView({
  listingId,
  currency,
  initialItems,
}: {
  listingId: string;
  currency: Currency;
  initialItems: HomeItem[];
}) {
  const [list, setList] = useState(initialItems);
  const [view, setView] = useState<View>("person");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totals = claimTotals(list);
  const people = claimsByPerson(list);
  const byItem = claimsByItem(list);
  const sold = soldItems(list);
  const money = (cents: number, count: number) =>
    cents === 0 && count > 0 ? "Free" : formatMoney(cents, currency, { whole: true });
  const price = (it: HomeItem) =>
    it.isFree ? "Free" : it.priceCents != null ? formatMoney(it.priceCents, currency, { whole: true }) : "";
  const itemHref = (it: HomeItem) => `/sell/${listingId}?item=${it.id}`;

  // Optimistic change; put the item back as it was if the save fails.
  async function act(it: HomeItem, patch: Partial<HomeItem>, call: () => Promise<ActionResult>) {
    setError(null);
    setConfirming(null);
    setList((l) => l.map((x) => (x.id === it.id ? { ...x, ...patch } : x)));
    const res = await call().catch(() => ({ ok: false as const, error: "" }));
    if (!res.ok) {
      setList((l) => l.map((x) => (x.id === it.id ? it : x)));
      setError("Couldn't save that. Check your connection and try again.");
    }
  }
  const sell = (it: HomeItem) =>
    act(it, { sold: true, soldTo: it.claim?.name ?? null, claim: null, claimant: null }, () => markSold(listingId, it.id));
  const release = (it: HomeItem) =>
    act(it, { claim: null, claimant: null }, () => releaseClaim(listingId, it.id));
  const unsell = (it: HomeItem) => act(it, { sold: false, soldTo: null }, () => undoSold(listingId, it.id));

  function actions(it: HomeItem) {
    if (confirming === it.id) {
      return (
        <div className="flex w-full flex-col gap-2 pb-3">
          <p className="text-sm text-text-primary">Release this claim? The item goes back to Available.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => release(it)} className="h-10 flex-1 rounded-full bg-text-primary text-sm font-medium text-white">
              Release
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="h-10 flex-1 rounded-full border border-border-alt bg-white text-sm font-medium text-text-primary"
            >
              Keep claim
            </button>
          </div>
        </div>
      );
    }
    return (
      <span className="flex shrink-0 gap-1.5">
        <button type="button" onClick={() => sell(it)} className="h-9 rounded-lg bg-forest px-3 text-[13px] font-medium text-white">
          Sold
        </button>
        <button
          type="button"
          onClick={() => setConfirming(it.id)}
          className="h-9 rounded-lg border border-border-alt bg-white px-3 text-[13px] font-medium text-text-primary"
        >
          Release
        </button>
      </span>
    );
  }

  const waitNames = (it: HomeItem) => it.waitlist.map((w) => w.name.trim() || "someone").join(", ");
  const empty = people.length === 0 && byItem.length === 0;

  return (
    <div className="flex flex-col">
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-border-weave bg-white px-3.5 py-3">
          <div className="font-serif text-[26px] font-semibold text-ochre-dark">{money(totals.claimed.cents, totals.claimed.count)}</div>
          <div className="text-[13px] text-text-secondary">
            claimed, {totals.claimed.count} {totals.claimed.count === 1 ? "item" : "items"}
          </div>
        </div>
        <div className="rounded-xl border border-border-weave bg-white px-3.5 py-3">
          <div className="font-serif text-[26px] font-semibold text-forest">{money(totals.sold.cents, totals.sold.count)}</div>
          <div className="text-[13px] text-text-secondary">
            sold, {totals.sold.count} {totals.sold.count === 1 ? "item" : "items"}
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-crimson shadow-sm">
          {error}
        </p>
      )}

      {empty ? (
        <p className="mt-6 rounded-xl border border-border-weave bg-white px-4 py-5 text-center text-sm text-text-secondary">
          No claims yet. When someone claims an item, they show up here with how to reach them.
        </p>
      ) : (
        <>
          <div role="group" aria-label="Group claims" className="mt-3.5 flex rounded-[10px] bg-bg-hover p-[3px]">
            {(["person", "item"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`h-9 flex-1 rounded-lg text-sm ${
                  view === v ? "bg-white font-medium text-text-primary" : "text-text-secondary"
                }`}
              >
                {v === "person" ? "By person" : "By item"}
              </button>
            ))}
          </div>

          {view === "person" ? (
            <div className="mt-3.5 flex flex-col gap-3">
              {people.map((g) => (
                <div key={g.key} className="rounded-xl border border-border-weave bg-white p-3.5">
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 text-base font-bold text-text-primary">{g.name || "No name"}</span>
                    <span className={`font-serif text-xl font-semibold ${g.totalCents === 0 ? "text-forest" : "text-text-primary"}`}>
                      {g.totalCents === 0 ? "Free" : formatMoney(g.totalCents, currency, { whole: true })}
                    </span>
                  </div>
                  <p className="text-sm">
                    <ContactLink contact={g.contact} />
                  </p>
                  <ul className="mt-2.5 flex flex-col border-t border-border-weave">
                    {g.items.map((it) => (
                      <li key={it.id} className="flex flex-wrap items-center gap-2 border-b border-border-weave py-1.5 text-sm last:border-b-0">
                        <Link href={itemHref(it)} className="min-w-0 flex-1 line-clamp-2 break-words py-2 text-text-primary">
                          {it.name} · {price(it)}
                        </Link>
                        {actions(it)}
                      </li>
                    ))}
                  </ul>
                  {g.items.some((it) => it.waitlist.length > 0) && (
                    <div className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-text-secondary">
                      {g.items
                        .filter((it) => it.waitlist.length > 0)
                        .map((it) => (
                          <span key={it.id}>
                            {it.name}: {it.waitlist.length} waiting · {waitNames(it)}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              ))}
              {byItem.some((it) => !it.claim) && (
                <p className="text-[13px] text-text-secondary">
                  {byItem.filter((it) => !it.claim).length} available{" "}
                  {byItem.filter((it) => !it.claim).length === 1 ? "item has" : "items have"} a waitlist. See By item.
                </p>
              )}
            </div>
          ) : (
            <ul className="mt-3.5 flex flex-col gap-3">
              {byItem.map((it) => (
                <li key={it.id} className="rounded-xl border border-border-weave bg-white p-3.5">
                  <div className="flex items-baseline gap-2">
                    <Link href={itemHref(it)} className="min-w-0 flex-1 line-clamp-2 break-words text-base font-bold text-text-primary">
                      {it.name}
                    </Link>
                    <span className="font-serif text-xl font-semibold text-text-primary">{price(it)}</span>
                  </div>
                  {it.claim ? (
                    <>
                      <p className="mt-0.5 text-sm text-text-primary">
                        Claimed by {it.claim.name.trim() || "someone"}
                        {it.claim.claimedAt && (
                          <span className="text-text-secondary"> · {formatDate(it.claim.claimedAt.slice(0, 10), currency)}</span>
                        )}
                      </p>
                      <p className="text-sm">
                        <ContactLink contact={it.claim.contact} />
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <span className="flex-1" />
                        {actions(it)}
                      </div>
                    </>
                  ) : (
                    <p className="mt-0.5 text-sm text-forest">Available</p>
                  )}
                  {it.waitlist.length > 0 && (
                    <ol className="mt-2.5 flex flex-col gap-0.5 border-t border-border-weave pt-2 text-[13px] text-text-secondary">
                      {it.waitlist.map((w, i) => (
                        <li key={`${w.contact}-${i}`}>
                          {i + 1}. {w.name.trim() || "Someone"} · <ContactLink contact={w.contact} />
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {sold.length > 0 && (
        <>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">Sold · {sold.length}</p>
          <ul className="mt-1.5 flex flex-col rounded-xl border border-border-weave bg-white px-3.5">
            {sold.map((it) => (
              <li key={it.id} className="flex items-center gap-2 border-b border-border-weave py-1.5 text-sm last:border-b-0">
                <Link href={itemHref(it)} className="min-w-0 flex-1 line-clamp-2 break-words py-2 text-text-secondary">
                  {it.name} · {price(it)}
                  {it.soldTo?.trim() ? ` · ${it.soldTo.trim()}` : ""}
                </Link>
                <button
                  type="button"
                  onClick={() => unsell(it)}
                  className="h-9 shrink-0 rounded-lg border border-border-alt bg-white px-3 text-[13px] font-medium text-text-primary"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
