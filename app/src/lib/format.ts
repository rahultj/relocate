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

const pad2 = (n: number) => String(n).padStart(2, "0");

function monthIndex(name: string): number {
  return MONTHS.findIndex(
    (mo) => mo.toLowerCase() === name.slice(0, 3).toLowerCase(),
  );
}

/**
 * Infer the year for a month/day with no year given. Uses the current year,
 * bumping to next year only if the date is well in the past (>6 months) — so a
 * "July 30" listed in spring stays this year, not next.
 */
function inferYear(month1: number, day: number): number {
  const now = new Date();
  const y = now.getFullYear();
  const cand = new Date(y, month1 - 1, day);
  const grace = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  grace.setMonth(grace.getMonth() - 6);
  return cand < grace ? y + 1 : y;
}

/**
 * Best-effort parse of a free-text date cell into an ISO date. Handles the
 * "Bought" trust-signal formats (month precision) AND "available from"
 * formats (full calendar dates, often without a year). US M/D/Y per project
 * convention. Month-only precision lands on the 1st. Unparseable -> null.
 *
 * Recognized: "now"/"today"/"asap", "2024-09-15", "2024-09", "July 30",
 * "Jul 30, 2026", "May 2020", "7/30/2026", "7/30", "5/2020".
 */
export function parseLooseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // "available now" style → today.
  if (/^(now|today|asap|immediately|available(\s+now)?|anytime)$/i.test(s)) {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  // ISO-ish: 2024-09 or 2024-09-15
  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${(d ?? "01").padStart(2, "0")}`;
  }

  // US M/D/Y: 7/30/2026 or 7/30/26
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const mi = Number(mdy[1]);
    const di = Number(mdy[2]);
    let y = Number(mdy[3]);
    if (mdy[3].length === 2) y += 2000;
    if (mi >= 1 && mi <= 12 && di >= 1 && di <= 31)
      return `${y}-${pad2(mi)}-${pad2(di)}`;
  }

  // Month + year: "5/2020"
  const numSlash = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (numSlash) return `${numSlash[2]}-${pad2(Number(numSlash[1]))}-01`;

  // Month/day, no year: "7/30"
  const md = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) {
    const mi = Number(md[1]);
    const di = Number(md[2]);
    if (mi >= 1 && mi <= 12 && di >= 1 && di <= 31)
      return `${inferYear(mi, di)}-${pad2(mi)}-${pad2(di)}`;
  }

  // Month name + day (+ optional year): "July 30", "Jul 30, 2026"
  const namedDay = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/);
  if (namedDay) {
    const mi = monthIndex(namedDay[1]);
    const di = Number(namedDay[2]);
    if (mi >= 0 && di >= 1 && di <= 31) {
      const y = namedDay[3] ? Number(namedDay[3]) : inferYear(mi + 1, di);
      return `${y}-${pad2(mi + 1)}-${pad2(di)}`;
    }
  }

  // Month name + year: "May 2020"
  const monNamed = s.match(/^([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (monNamed) {
    const mi = monthIndex(monNamed[1]);
    if (mi >= 0) return `${monNamed[2]}-${pad2(mi + 1)}-01`;
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
