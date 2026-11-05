// One-tap price buttons on the draft card, per category and sale currency.
// Placeholder steps from the seller v1 plan; watch what sellers actually pick.
// Amounts are minor units (cents or paise). Free comes first and "Other…" last
// in the UI; neither is listed here.

import type { Currency } from "./money";

const STEPS: Record<Currency, { furniture: number[]; small: number[] }> = {
  USD: {
    furniture: [2500, 5000, 10000, 20000],
    small: [500, 1000, 2000, 5000],
  },
  INR: {
    furniture: [50000, 100000, 200000, 500000],
    small: [10000, 20000, 50000, 100000],
  },
};

export function priceSteps(category: string | null, currency: Currency): number[] {
  const steps = STEPS[currency];
  return category === "Furniture" ? steps.furniture : steps.small;
}
