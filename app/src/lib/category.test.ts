import { describe, it, expect } from "vitest";
import {
  normalizeCategory,
  suggestCategory,
  resolveCategory,
} from "./category";

describe("normalizeCategory", () => {
  it("matches canonical names case-insensitively", () => {
    expect(normalizeCategory("Furniture")).toBe("Furniture");
    expect(normalizeCategory("kitchen")).toBe("Kitchen");
    expect(normalizeCategory("  ELECTRONICS  ")).toBe("Electronics");
  });

  it("maps known synonyms", () => {
    expect(normalizeCategory("appliances")).toBe("Electronics");
    expect(normalizeCategory("kitchenware")).toBe("Kitchen");
    expect(normalizeCategory("linens")).toBe("Bedding");
    expect(normalizeCategory("misc")).toBe("Decor");
  });

  it("returns null for blank or unknown input", () => {
    expect(normalizeCategory("")).toBeNull();
    expect(normalizeCategory(null)).toBeNull();
    expect(normalizeCategory(undefined)).toBeNull();
    expect(normalizeCategory("spaceship")).toBeNull();
  });
});

describe("suggestCategory", () => {
  it("classifies obvious items by keyword", () => {
    expect(suggestCategory("Sofa")).toBe("Furniture");
    expect(suggestCategory("Office Desk/Dining Table")).toBe("Furniture");
    expect(suggestCategory("Instant Pot")).toBe("Kitchen");
    expect(suggestCategory("Air frier")).toBe("Kitchen");
    expect(suggestCategory("Standing lamp - 1")).toBe("Lighting");
    expect(suggestCategory("Weighted blanket")).toBe("Bedding");
    expect(suggestCategory("Picture frame black")).toBe("Decor");
  });

  it("resolves the table-fan vs table-lamp vs table ambiguity by order", () => {
    expect(suggestCategory("Table fan")).toBe("Electronics");
    expect(suggestCategory("Table lamp - 2")).toBe("Lighting");
    expect(suggestCategory("Coffee Table")).toBe("Furniture");
  });

  it("returns null when nothing matches", () => {
    expect(suggestCategory("Mystery box")).toBeNull();
    expect(suggestCategory("")).toBeNull();
    expect(suggestCategory(null)).toBeNull();
  });
});

describe("resolveCategory", () => {
  it("prefers an explicit CSV category over the name guess", () => {
    // "Table fan" would guess Electronics, but explicit Decor wins.
    expect(resolveCategory("Decor", "Table fan")).toBe("Decor");
  });

  it("falls back to the name suggestion when the cell is blank", () => {
    expect(resolveCategory("", "Sofa")).toBe("Furniture");
    expect(resolveCategory(null, "Standing lamp")).toBe("Lighting");
  });

  it("is null when neither the cell nor the name resolves", () => {
    expect(resolveCategory("", "Mystery box")).toBeNull();
  });
});
