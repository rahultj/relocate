import { describe, it, expect } from "vitest";
import { formatMoney, moneyParts, currencySymbol, listingCurrency } from "./money";

describe("formatMoney", () => {
  it("keeps USD output as before", () => {
    expect(formatMoney(4000, "USD")).toBe("$40");
    expect(formatMoney(4050, "USD")).toBe("$40.50");
    expect(formatMoney(0, "USD")).toBe("$0");
  });
  it("groups thousands", () => {
    expect(formatMoney(142100, "USD")).toBe("$1,421");
  });
  it("uses Indian grouping for INR", () => {
    expect(formatMoney(50000, "INR")).toBe("₹500");
    expect(formatMoney(150000, "INR")).toBe("₹1,500");
    expect(formatMoney(15000000, "INR")).toBe("₹1,50,000");
    expect(formatMoney(50050, "INR")).toBe("₹500.50");
  });
  it("rounds to whole units when asked", () => {
    expect(formatMoney(4050, "USD", { whole: true })).toBe("$41");
    expect(formatMoney(4049, "USD", { whole: true })).toBe("$40");
  });
});

describe("moneyParts", () => {
  it("splits symbol from amount", () => {
    expect(moneyParts(4000, "USD")).toEqual({ symbol: "$", amount: "40" });
    expect(moneyParts(15000000, "INR")).toEqual({ symbol: "₹", amount: "1,50,000" });
  });
});

describe("currencySymbol", () => {
  it("returns the bare symbol", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("INR")).toBe("₹");
  });
});

describe("listingCurrency", () => {
  it("falls back to USD", () => {
    expect(listingCurrency()).toBe("USD");
    expect(listingCurrency({ currency: null })).toBe("USD");
    expect(listingCurrency({ currency: "EUR" })).toBe("USD");
  });
  it("passes a known currency through", () => {
    expect(listingCurrency({ currency: "INR" })).toBe("INR");
  });
});
