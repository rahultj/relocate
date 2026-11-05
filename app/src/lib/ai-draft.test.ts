import { describe, it, expect } from "vitest";
import {
  applyDraft,
  draftFields,
  draftSignature,
  isPlaceholderName,
  isStoragePhoto,
  type DraftFields,
  type DraftResult,
} from "./ai-draft";

const result = (over: Partial<DraftResult> = {}): DraftResult => ({
  name: "Grey 3-seat sofa",
  category: "Furniture",
  description: "Grey fabric three-seat sofa with wooden legs.",
  brand: null,
  brandGuess: null,
  ambiguous: false,
  candidates: [],
  originalPrice: null,
  boughtYear: null,
  boughtMonth: null,
  ...over,
});

const blank: DraftFields = {
  name: "Item 1",
  category: null,
  description: null,
  originalPriceCents: null,
  boughtDate: null,
};

describe("draftFields", () => {
  it("turns a major-unit price into minor units", () => {
    expect(draftFields(result({ originalPrice: 600 })).originalPriceCents).toBe(60000);
    expect(draftFields(result({ originalPrice: 49.99 })).originalPriceCents).toBe(4999);
  });
  it("drops zero, negative and missing prices", () => {
    expect(draftFields(result({ originalPrice: 0 })).originalPriceCents).toBeNull();
    expect(draftFields(result({ originalPrice: -5 })).originalPriceCents).toBeNull();
  });
  it("needs both month and year for a bought date", () => {
    const now = new Date("2026-11-02");
    expect(draftFields(result({ boughtYear: 2022, boughtMonth: 3 }), now).boughtDate).toBe("2022-03-01");
    expect(draftFields(result({ boughtYear: 2022 }), now).boughtDate).toBeNull();
    expect(draftFields(result({ boughtYear: 2030, boughtMonth: 1 }), now).boughtDate).toBeNull();
    expect(draftFields(result({ boughtYear: 2022, boughtMonth: 13 }), now).boughtDate).toBeNull();
  });
  it("falls back to Other for an unknown category", () => {
    expect(draftFields(result({ category: "Toys" })).category).toBe("Other");
  });
  it("trims, and nulls an empty description", () => {
    const f = draftFields(result({ name: "  Lamp  ", description: "  " }));
    expect(f.name).toBe("Lamp");
    expect(f.description).toBeNull();
  });
});

describe("applyDraft", () => {
  it("fills a fresh draft", () => {
    expect(applyDraft(blank, null, result({ originalPrice: 600 }))).toEqual({
      name: "Grey 3-seat sofa",
      category: "Furniture",
      description: "Grey fabric three-seat sofa with wooden legs.",
      originalPriceCents: 60000,
    });
  });
  it("replaces what the previous draft wrote", () => {
    const prev = result();
    const item = { ...blank, ...draftFields(prev) };
    const next = result({ name: "Grey sofa bed", description: "A sofa bed." });
    expect(applyDraft(item, prev, next)).toEqual({ name: "Grey sofa bed", description: "A sofa bed." });
  });
  it("never overwrites a field the seller changed", () => {
    const prev = result();
    const item = { ...blank, ...draftFields(prev), name: "Mum's couch", category: "Decor" };
    const patch = applyDraft(item, prev, result({ name: "Grey sofa bed", category: "Other" }));
    expect(patch.name).toBeUndefined();
    expect(patch.category).toBeUndefined();
  });
  it("doesn't overwrite seller data on a first draft", () => {
    const item = { ...blank, name: "Couch", originalPriceCents: 50000 };
    expect(applyDraft(item, null, result({ originalPrice: 600 }))).toEqual({
      category: "Furniture",
      description: "Grey fabric three-seat sofa with wooden legs.",
    });
  });
  it("clears an AI-written fact the new note no longer gives", () => {
    const prev = result({ originalPrice: 600 });
    const item = { ...blank, ...draftFields(prev) };
    expect(applyDraft(item, prev, result())).toEqual({ originalPriceCents: null });
  });
});

describe("helpers", () => {
  it("spots the placeholder name", () => {
    expect(isPlaceholderName("Item 12")).toBe(true);
    expect(isPlaceholderName("Item lamp")).toBe(false);
  });
  it("signs photos and the trimmed note", () => {
    expect(draftSignature(["a"], " hi ")).toBe(draftSignature(["a"], "hi"));
    expect(draftSignature(["a"], null)).toBe(draftSignature(["a"], ""));
    expect(draftSignature(["a", "b"], "")).not.toBe(draftSignature(["b", "a"], ""));
  });
  it("only accepts our public Storage URLs", () => {
    const base = "https://abc.supabase.co";
    expect(isStoragePhoto(`${base}/storage/v1/object/public/item-photos/x.jpg`, base)).toBe(true);
    expect(isStoragePhoto("https://evil.example/x.jpg", base)).toBe(false);
    expect(isStoragePhoto(`${base}/storage/v1/object/public/x.jpg`, undefined)).toBe(false);
  });
});
