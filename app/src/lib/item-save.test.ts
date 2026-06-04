import { describe, it, expect } from "vitest";
import { parsePriceField, groupByListed } from "./item-save";

describe("parsePriceField", () => {
  it("treats empty and 'Free' (any case) as free", () => {
    expect(parsePriceField("")).toEqual({ isFree: true, priceCents: null });
    expect(parsePriceField("   ")).toEqual({ isFree: true, priceCents: null });
    expect(parsePriceField("Free")).toEqual({ isFree: true, priceCents: null });
    expect(parsePriceField("FREE")).toEqual({ isFree: true, priceCents: null });
    expect(parsePriceField(" free ")).toEqual({ isFree: true, priceCents: null });
  });

  it("parses dollar amounts to cents (with or without $)", () => {
    expect(parsePriceField("40")).toEqual({ isFree: false, priceCents: 4000 });
    expect(parsePriceField("$40")).toEqual({ isFree: false, priceCents: 4000 });
    expect(parsePriceField(" 40.50 ")).toEqual({
      isFree: false,
      priceCents: 4050,
    });
  });

  it("is not free for a junk price, but priceCents falls back to null", () => {
    // "abc" isn't the free sentinel, so isFree stays false; the amount is null.
    expect(parsePriceField("abc")).toEqual({ isFree: false, priceCents: null });
  });
});

describe("groupByListed", () => {
  it("splits persisted ids into listed / unlisted groups", () => {
    const rows = [
      { itemId: "a", listed: true },
      { itemId: "b", listed: false },
      { itemId: "c", listed: true },
    ];
    expect(groupByListed(rows)).toEqual({ relist: ["a", "c"], unlist: ["b"] });
  });

  it("drops rows with no itemId (never persisted)", () => {
    const rows = [
      { itemId: null, listed: true },
      { itemId: "x", listed: false },
    ];
    expect(groupByListed(rows)).toEqual({ relist: [], unlist: ["x"] });
  });

  it("handles an empty set", () => {
    expect(groupByListed([])).toEqual({ relist: [], unlist: [] });
  });
});
