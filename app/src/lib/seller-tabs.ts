// The seller tabs' names, page titles and addresses. Pure, so the server page
// and the client tab bar (sell/[id]/seller-tabs.tsx) share them.

export type SellerTab = "items" | "claims" | "sale";

export const TAB_TITLES: Record<SellerTab, string> = {
  items: "Your sale · mustgo",
  claims: "Claims · mustgo",
  sale: "Sale settings · mustgo",
};

/** The tab for the catch-all's segments: none → Items; unknown → null (404). */
export function tabFromSegments(segments: string[] | undefined): SellerTab | null {
  if (!segments || segments.length === 0) return "items";
  if (segments.length === 1 && (segments[0] === "claims" || segments[0] === "sale")) return segments[0];
  return null;
}

/** The tab an address shows, given the sale's base path (/sell/<id>). */
export function tabFromPath(pathname: string, base: string): SellerTab | null {
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const rest = pathname.slice(base.length).replace(/^\/+|\/+$/g, "");
  return tabFromSegments(rest ? rest.split("/") : []);
}

export function tabHref(base: string, tab: SellerTab): string {
  return tab === "items" ? base : `${base}/${tab}`;
}
