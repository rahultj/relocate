"use client";

// The way back from the buyer view to the seller's own screens. The seller
// home and /manage remember their sale (UUID + current slug) in this browser;
// the buyer feed and item pages then show a slim "Back to your sale" bar to
// that browser only. The UUID never reaches buyer HTML: it lives solely in
// the seller's own localStorage.

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const KEY = "mustgo_seller_sales";
const MAX = 20;

interface SellerSale {
  id: string;
  slug: string;
}

function read(raw: string | null): SellerSale[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((s) => s && typeof s.id === "string" && typeof s.slug === "string") : [];
  } catch {
    return [];
  }
}

/** Remember this browser as the seller of a sale; re-runs when the slug is renamed. */
export function RememberSale({ id, slug }: SellerSale) {
  useEffect(() => {
    try {
      const rest = read(localStorage.getItem(KEY)).filter((s) => s.id !== id);
      localStorage.setItem(KEY, JSON.stringify([{ id, slug }, ...rest].slice(0, MAX)));
    } catch {
      // storage blocked: the bar just won't show
    }
  }, [id, slug]);
  return null;
}

const noSubscribe = () => () => {};
const snapshot = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Shown on buyer pages only when this browser runs the sale. */
export function SellerBar({ slug, itemId }: { slug: string; itemId?: string }) {
  const raw = useSyncExternalStore(noSubscribe, snapshot, () => null);
  const sale = read(raw).find((s) => s.slug === slug);
  if (!sale) return null;

  const href = itemId ? `/manage/${sale.id}#item-${itemId}` : `/sell/${sale.id}`;
  return (
    <div className="flex items-center justify-between gap-3 bg-text-primary px-4 py-2.5 text-[13px] text-white">
      <span className="min-w-0 truncate">You&apos;re seeing what buyers see</span>
      <Link href={href} className="flex shrink-0 items-center gap-1 font-medium underline-offset-4 hover:underline">
        Back to your sale
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
