import { describe, expect, it } from "vitest";
import { isReady, missingForPublish, withBrand } from "./draft-queue";
import { priceSteps } from "./price-steps";

const ready = {
  photoUrls: ["https://x/a.jpg"],
  name: "Grey 3-seat sofa",
  condition: "good",
  priceCents: 5000,
  isFree: false,
};

describe("missingForPublish", () => {
  it("is empty for a finished draft", () => {
    expect(missingForPublish(ready)).toEqual([]);
    expect(isReady(ready)).toBe(true);
  });

  it("counts Free as a price", () => {
    expect(isReady({ ...ready, priceCents: null, isFree: true })).toBe(true);
  });

  it("lists everything missing, in card order", () => {
    expect(
      missingForPublish({ photoUrls: [], name: "Item 3", condition: null, priceCents: null, isFree: false }),
    ).toEqual(["a photo", "a name", "a condition", "a price"]);
  });

  it("treats a blank name as missing", () => {
    expect(missingForPublish({ ...ready, name: "  " })).toEqual(["a name"]);
  });
});

describe("withBrand", () => {
  it("prefixes the brand and lowercases a sentence-case first word", () => {
    expect(withBrand("Grey 3-seat sofa", "IKEA Kivik")).toBe("IKEA Kivik grey 3-seat sofa");
  });

  it("keeps an acronym", () => {
    expect(withBrand("LED desk lamp", "IKEA")).toBe("IKEA LED desk lamp");
  });

  it("leaves a name that already has the brand", () => {
    expect(withBrand("Silver MacBook Air", "macbook")).toBe("Silver MacBook Air");
  });

  it("replaces a placeholder name", () => {
    expect(withBrand("Item 4", "Dyson V8")).toBe("Dyson V8");
  });
});

describe("priceSteps", () => {
  it("uses furniture steps for Furniture only", () => {
    expect(priceSteps("Furniture", "USD")).toEqual([2500, 5000, 10000, 20000]);
    expect(priceSteps("Kitchen", "USD")).toEqual([500, 1000, 2000, 5000]);
    expect(priceSteps(null, "INR")).toEqual([10000, 20000, 50000, 100000]);
    expect(priceSteps("Furniture", "INR")).toEqual([50000, 100000, 200000, 500000]);
  });
});
