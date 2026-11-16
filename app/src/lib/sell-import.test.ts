import { describe, expect, it } from "vitest";
import type { ItemDraft } from "./csv";
import type { HomeItem } from "./seller-home";
import { normLabel, planImport, suggestItem } from "./sell-import";

function item(over: Partial<HomeItem>): HomeItem {
  return {
    id: "x",
    slug: "s",
    name: "Thing",
    photoUrl: null,
    photoUrls: ["p.jpg"],
    priceCents: 4000,
    isFree: false,
    listed: true,
    sold: false,
    claimant: null,
    waiting: 0,
    description: "Old words",
    condition: "good",
    category: "Furniture",
    boughtDate: null,
    originalPriceCents: null,
    originalBoxIncluded: null,
    availableFrom: "2026-06-01",
    venmoHandle: null,
    venmoLink: null,
    upiId: null,
    claim: null,
    soldTo: null,
    waitlist: [],
    ...over,
  };
}

function draft(over: Partial<ItemDraft>): ItemDraft {
  return {
    id: "d",
    name: "",
    description: "",
    condition: null,
    priceText: "",
    originalPriceText: "",
    boughtDate: null,
    originalBoxIncluded: null,
    availableFrom: "",
    category: null,
    venmoHandle: "",
    venmoLink: "",
    upiId: "",
    photoDataUrls: [],
    state: "draft",
    ...over,
  };
}

describe("planImport", () => {
  const sofa = item({ id: "sofa", name: "Grey sofa", priceCents: 18000 });

  it("updates a matching item by name, ignoring case and spacing", () => {
    const plan = planImport([sofa], [draft({ name: "  grey  SOFA ", priceText: "150" })], null);
    expect(plan.updated).toBe(1);
    expect(plan.added).toBe(0);
    expect(plan.rows[0]).toMatchObject({ itemId: "sofa", priceCents: 15000, listed: true, description: "Old words" });
  });

  it("never overwrites with blank cells, and skips unchanged items", () => {
    const plan = planImport([sofa], [draft({ name: "Grey sofa" })], null);
    expect(plan.rows).toEqual([]);
  });

  it("adds new rows hidden, with the sale's start date", () => {
    const plan = planImport([sofa], [draft({ name: "Lamp", priceText: "Free" })], "2026-06-14");
    expect(plan.added).toBe(1);
    expect(plan.rows[0]).toMatchObject({ itemId: null, name: "Lamp", isFree: true, listed: false, availableFrom: "2026-06-14" });
  });

  it("folds repeated new names into one item", () => {
    const plan = planImport([], [draft({ name: "Lamp", priceText: "5" }), draft({ name: "lamp", description: "Brass" })], null);
    expect(plan.added).toBe(1);
    expect(plan.rows[0]).toMatchObject({ priceCents: 500, description: "Brass" });
  });

  it("parses the original price", () => {
    const plan = planImport([sofa], [draft({ name: "Grey sofa", originalPriceText: "$600" })], null);
    expect(plan.rows[0].originalPriceCents).toBe(60000);
  });
});

describe("photo matching", () => {
  const items = [
    { id: "couch", name: "Orange couch" },
    { id: "lamp", name: "Lamp" },
    { id: "desk-lamp", name: "Desk lamp" },
  ];
  it("normalizes filenames", () => {
    expect(normLabel("Orange_Couch-2.JPG", true)).toBe("orange couch 2");
  });
  it("matches exact names, then numbered extras, then partials", () => {
    expect(suggestItem("orange couch.jpg", items)).toBe("couch");
    expect(suggestItem("orange-couch-2.jpg", items)).toBe("couch");
    expect(suggestItem("desk lamp.png", items)).toBe("desk-lamp");
    expect(suggestItem("couch.jpg", items)).toBe("couch");
    expect(suggestItem("IMG_0042.jpg", items)).toBe("");
  });
});
