// Money display, per sale currency. Storage stays integer minor units in
// `price_cents` (cents for USD, paise for INR); the sale's currency decides how
// it renders. Pure + tested.

export const CURRENCIES = ["USD", "INR"] as const;
export type Currency = (typeof CURRENCIES)[number];

// Every sale is USD until listings carry a currency column (seller v1).
export const DEFAULT_CURRENCY: Currency = "USD";

const LOCALES: Record<Currency, string> = { USD: "en-US", INR: "en-IN" };

/**
 * The currency a listing sells in. Listings don't store one yet, so this falls
 * back to DEFAULT_CURRENCY; once the column exists, pass the listing through.
 */
export function listingCurrency(listing?: { currency?: string | null }): Currency {
  const c = listing?.currency;
  return CURRENCIES.find((x) => x === c) ?? DEFAULT_CURRENCY;
}

function formatter(currency: Currency, decimals: 0 | 2) {
  return new Intl.NumberFormat(LOCALES[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 4000 -> "$40", 4050 -> "$40.50", 15000000 INR -> "₹1,50,000".
 * Whole amounts drop the decimals. `whole` rounds to a whole unit (feed, QR
 * sheet), where 4050 -> "$41".
 */
export function formatMoney(
  minor: number,
  currency: Currency,
  { whole = false }: { whole?: boolean } = {},
): string {
  const decimals = whole || minor % 100 === 0 ? 0 : 2;
  return formatter(currency, decimals).format(minor / 100);
}

/**
 * The same as formatMoney({ whole: true }), split so the symbol can be styled
 * apart from the number: 4000 -> { symbol: "$", amount: "40" }.
 */
export function moneyParts(minor: number, currency: Currency): { symbol: string; amount: string } {
  const parts = formatter(currency, 0).formatToParts(minor / 100);
  return {
    symbol: parts.filter((p) => p.type === "currency").map((p) => p.value).join(""),
    amount: parts.filter((p) => p.type !== "currency" && p.type !== "literal").map((p) => p.value).join(""),
  };
}

/** "$" / "₹" — the input adornment beside a price field. */
export function currencySymbol(currency: Currency): string {
  return moneyParts(0, currency).symbol;
}
