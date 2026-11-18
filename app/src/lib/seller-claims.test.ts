import { describe, expect, it } from "vitest";
import type { HomeItem } from "./seller-home";
import { claimTotals, claimsByItem, claimsByPerson, soldItems } from "./seller-claims";

let n = 0;
function item(over: Partial<HomeItem> = {}): HomeItem {
  n++;
  return {
    id: `i${n}`,
    slug: `s${n}`,
    name: `Item ${n}`,
    photoUrl: null,
    photoUrls: [],
    priceCents: 1000,
    isFree: false,
    listed: true,
    sold: false,
    claimant: null,
    waiting: 0,
    description: null,
    condition: null,
    category: null,
    boughtDate: null,
    originalPriceCents: null,
    originalBoxIncluded: null,
    availableFrom: null,
    venmoHandle: null,
    venmoLink: null,
    upiId: null,
    claim: null,
    soldTo: null,
    waitlist: [],
    ...over,
  };
}
const sam = { name: "Sam K.", contact: "2025550142", claimedAt: "2026-06-12T10:00:00Z" };
const jo = { name: "Jo P.", contact: "jo@example.com", claimedAt: "2026-06-13T10:00:00Z" };

describe("claimTotals", () => {
  it("sums open claims and sales; free counts at zero", () => {
    const t = claimTotals([
      item({ name: "Sofa", priceCents: 18000, claim: sam }),
      item({ name: "Mirror", priceCents: 2000, claim: sam }),
      item({ name: "Helmet", isFree: true, priceCents: null, claim: jo }),
      item({ name: "Table", priceCents: 12000, sold: true }),
      item({ name: "Lamp" }),
    ]);
    expect(t.claimed).toEqual({ cents: 20000, count: 3 });
    expect(t.sold).toEqual({ cents: 12000, count: 1 });
  });
  it("leaves out claims on hidden items", () => {
    expect(claimTotals([item({ listed: false, claim: sam })]).claimed.count).toBe(0);
  });
});

describe("claimsByPerson", () => {
  it("groups a buyer's claims by contact, with a total", () => {
    const groups = claimsByPerson([
      item({ name: "Sofa", priceCents: 18000, claim: sam }),
      item({ name: "Mirror", priceCents: 2000, claim: { ...sam, name: "Sam" } }),
      item({ name: "Helmet", isFree: true, priceCents: null, claim: jo }),
      item({ name: "Lamp" }),
    ]);
    expect(groups.map((g) => [g.name, g.totalCents, g.items.length])).toEqual([
      ["Jo P.", 0, 1],
      ["Sam K.", 20000, 2],
    ]);
  });
  it("skips sold and hidden items", () => {
    expect(claimsByPerson([item({ sold: true, claim: sam }), item({ listed: false, claim: jo })])).toEqual([]);
  });
});

describe("claimsByItem", () => {
  it("lists claimed items first, then waitlist-only ones", () => {
    const rows = claimsByItem([
      item({ name: "B waitlist", waitlist: [{ name: "Dana", contact: "d@x.com" }] }),
      item({ name: "A free" }),
      item({ name: "C claimed", claim: sam }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["C claimed", "B waitlist"]);
  });
});

describe("soldItems", () => {
  it("lists sold items by name", () => {
    expect(soldItems([item({ name: "Z", sold: true }), item({ name: "A", sold: true }), item()]).map((i) => i.name)).toEqual([
      "A",
      "Z",
    ]);
  });
});
