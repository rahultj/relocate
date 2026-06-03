// Display + parse helpers. Storage is integer cents + ISO 8601 dates;
// the UI speaks US dollars and US date format (CLAUDE.md data conventions).

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** 4000 -> "$40", 4050 -> "$40.50". Whole dollars drop the decimals. */
export function formatPrice(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}

/** Parse a price cell. "$40", "40", " 40 " -> 4000. "Free"/""/"-" -> null. */
export function parsePriceToCents(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s === "" || s === "free" || s === "-" || s === "—") return null;
  const n = Number(s.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** ISO date string -> "Jun 14, 2026". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** ISO date string -> "Jun 12" (status chips, no year). */
export function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

/** ISO date string -> "May 2020" (trust-signal "Bought" line, month precision). */
export function formatMonthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * Best-effort parse of a "bought" cell into an ISO date.
 * Handles "May 2020", "Sep 2024", "2020-05", "5/2020", "2024-09-15".
 * Month-only precision lands on the first of the month. Unparseable -> null.
 */
export function parseLooseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Already ISO-ish: 2024-09 or 2024-09-15
  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${(d ?? "01").padStart(2, "0")}`;
  }

  // "May 2020" / "Sep 2024"
  const monNamed = s.match(/^([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (monNamed) {
    const idx = MONTHS.findIndex(
      (mo) => mo.toLowerCase() === monNamed[1].slice(0, 3).toLowerCase(),
    );
    if (idx >= 0) return `${monNamed[2]}-${String(idx + 1).padStart(2, "0")}-01`;
  }

  // "5/2020" or "05/2020"
  const numSlash = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (numSlash) {
    return `${numSlash[2]}-${numSlash[1].padStart(2, "0")}-01`;
  }

  return null;
}

/** Coerce a free-text condition cell to the schema enum. null if unknown. */
export type ItemCondition = "new" | "like_new" | "good" | "fair" | "worn";

export function parseCondition(raw: string): ItemCondition | null {
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (s === "new" || s === "brandnew" || s === "sealed") return "new";
  if (s === "likenew" || s === "asnew" || s === "mint" || s === "excellent")
    return "like_new";
  if (s === "good") return "good";
  if (s === "fair" || s === "okay" || s === "ok") return "fair";
  if (s === "worn" || s === "poor" || s === "used") return "worn";
  return null;
}

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};

/** Coerce a truthy-ish cell ("yes", "y", "true", "✓", "1") to bool. */
export function parseBool(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return ["yes", "y", "true", "1", "✓", "x", "included"].includes(s);
}
