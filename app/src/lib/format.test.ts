import { describe, it, expect } from "vitest";
import {
  formatPrice,
  parsePriceToCents,
  formatDate,
  formatMonthDay,
  formatMonthYear,
  parseLooseDate,
  parseCondition,
  parseBool,
} from "./format";

describe("formatPrice", () => {
  it("drops decimals for whole dollars, keeps them otherwise", () => {
    expect(formatPrice(4000)).toBe("$40");
    expect(formatPrice(4050)).toBe("$40.50");
    expect(formatPrice(0)).toBe("$0");
  });
});

describe("parsePriceToCents", () => {
  it("parses plain and $-prefixed amounts", () => {
    expect(parsePriceToCents("40")).toBe(4000);
    expect(parsePriceToCents("$40")).toBe(4000);
    expect(parsePriceToCents(" 1,234.5 ")).toBe(123450);
  });
  it("returns null for free/blank/dash sentinels", () => {
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("Free")).toBeNull();
    expect(parsePriceToCents("-")).toBeNull();
    expect(parsePriceToCents("—")).toBeNull();
  });
  it("returns null for negatives and junk", () => {
    expect(parsePriceToCents("-5")).toBeNull();
    expect(parsePriceToCents("abc")).toBeNull();
  });
});

describe("date formatters", () => {
  it("formats ISO dates US-style", () => {
    expect(formatDate("2026-06-14")).toBe("Jun 14, 2026");
    expect(formatMonthDay("2026-06-14")).toBe("Jun 14");
    expect(formatMonthYear("2020-05-01")).toBe("May 2020");
  });
  it("returns input unchanged when unparseable", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("parseLooseDate", () => {
  it("parses ISO with and without day", () => {
    expect(parseLooseDate("2024-09-15")).toBe("2024-09-15");
    expect(parseLooseDate("2024-09")).toBe("2024-09-01");
  });
  it("parses US M/D/Y including 2-digit years", () => {
    expect(parseLooseDate("7/30/2026")).toBe("2026-07-30");
    expect(parseLooseDate("7/30/26")).toBe("2026-07-30");
  });
  it("parses month/year slash and month names", () => {
    expect(parseLooseDate("5/2020")).toBe("2020-05-01");
    expect(parseLooseDate("Jul 30, 2026")).toBe("2026-07-30");
    expect(parseLooseDate("May 2020")).toBe("2020-05-01");
  });
  it("maps now/today to a valid ISO date", () => {
    expect(parseLooseDate("today")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parseLooseDate("now")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("returns null for blank/garbage", () => {
    expect(parseLooseDate("")).toBeNull();
    expect(parseLooseDate("whenever-ish")).toBeNull();
  });
});

describe("parseCondition", () => {
  it("coerces aliases to the enum", () => {
    expect(parseCondition("Brand New")).toBe("new");
    expect(parseCondition("like-new")).toBe("like_new");
    expect(parseCondition("excellent")).toBe("like_new");
    expect(parseCondition("OK")).toBe("fair");
    expect(parseCondition("used")).toBe("worn");
  });
  it("returns null for unknown", () => {
    expect(parseCondition("pristine-ish")).toBeNull();
    expect(parseCondition("")).toBeNull();
  });
});

describe("parseBool", () => {
  it("reads truthy tokens", () => {
    for (const t of ["yes", "y", "true", "1", "✓", "x", "Included"])
      expect(parseBool(t)).toBe(true);
  });
  it("is false otherwise", () => {
    expect(parseBool("no")).toBe(false);
    expect(parseBool("")).toBe(false);
  });
});
