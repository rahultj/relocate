"use client";

// The Items · Claims · Sale tab bar. All three tabs arrive with the page, so
// a tap swaps them right here: the address changes with history.pushState
// (Next keeps usePathname in step, and Back returns to the last tab) and no
// request goes to the server. The tab shown is read from the address.

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { TAB_TITLES, tabFromPath, tabHref, type SellerTab } from "@/lib/seller-tabs";

/** Move to another seller tab (or the item sheet's ?item= address) in place. */
export function goTo(href: string) {
  window.history.pushState(null, "", href);
}

/** Let a plain tap switch in place; keep new-tab and modified clicks native. */
export function inPlace(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  goTo(href);
}

export function SellerTabs({
  base,
  labels,
  panels,
}: {
  base: string;
  labels: Record<SellerTab, string>;
  panels: Record<SellerTab, React.ReactNode>;
}) {
  const pathname = usePathname();
  const active = tabFromPath(pathname, base) ?? "items";

  useEffect(() => {
    document.title = TAB_TITLES[active];
  }, [active]);

  const order: SellerTab[] = ["items", "claims", "sale"];

  return (
    <>
      <nav aria-label="Seller sections" className="mt-4 flex gap-6 border-b border-border-weave">
        {order.map((key) => {
          const on = key === active;
          const href = tabHref(base, key);
          return (
            <a
              key={key}
              href={href}
              onClick={(e) => (on ? e.preventDefault() : inPlace(e, href))}
              aria-current={on ? "page" : undefined}
              className={`flex h-10 items-center border-b-2 text-[15px] ${
                on
                  ? "border-text-primary font-bold text-text-primary"
                  : "border-transparent font-medium text-text-secondary"
              }`}
            >
              {labels[key]}
            </a>
          );
        })}
      </nav>

      {/* Only the shown tab is mounted, so each one starts from the latest
          data the server sent (Sold and Release refresh it). */}
      {panels[active]}
    </>
  );
}
