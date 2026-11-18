import { describe, expect, it } from "vitest";
import { itemFacts, percentOff, type FactsItem } from "./item-facts";

const base: FactsItem = {
  priceCents: 35000,
  isFree: false,
  originalPriceCents: null,
  originalBoxIncluded: null,
  boughtDate: null,
  availableFrom: null,
  condition: null,
};
const TODAY = "2026-11-18";

describe("percentOff", () => {
  it("rounds a real markdown", () => {
    expect(percentOff({ ...base, originalPriceCents: 99900 })).toBe(65);
  });
  it("is null with no markdown, or for free items", () => {
    expect(percentOff(base)).toBeNull();
    expect(percentOff({ ...base, originalPriceCents: 30000 })).toBeNull();
    expect(percentOff({ ...base, isFree: true, priceCents: 0, originalPriceCents: 5000 })).toBeNull();
  });
});

describe("itemFacts", () => {
  it("reads in order and drops what's missing", () => {
    const facts = itemFacts(
      { ...base, condition: "good", boughtDate: "2023-09-01", originalPriceCents: 99900, originalBoxIncluded: true, availableFrom: "2026-12-15" },
      "Columbia Heights",
      "USD",
      TODAY,
    );
    expect(facts).toEqual(["Good condition", "Bought Sep 2023", "Box included", "Available Dec 15", "Pickup in Columbia Heights"]);
  });
  it("names the original price when it isn't struck beside the price", () => {
    expect(itemFacts({ ...base, isFree: true, priceCents: 0, originalPriceCents: 5000 }, "", "USD", TODAY)).toEqual(["Originally $50"]);
  });
  it("leaves out availability that's already here", () => {
    expect(itemFacts({ ...base, availableFrom: "2026-06-01" }, "", "USD", TODAY)).toEqual([]);
  });
  it("uses day-first dates on INR sales", () => {
    expect(itemFacts({ ...base, availableFrom: "2026-12-15" }, "", "INR", TODAY)).toEqual(["Available 15 Dec"]);
  });
});
