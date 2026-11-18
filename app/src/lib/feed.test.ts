import { describe, expect, it } from "vitest";
import { feedChips, goneLabel, groupByCategory, matchesChip, splitFeed, type FeedEntry } from "./feed";

const item = (o: Partial<FeedEntry> & { id?: string }) => ({
  id: "x",
  category: "Furniture",
  status: "listed" as const,
  isFree: false,
  priceCents: 1000,
  availableFrom: null,
  ...o,
});

const TODAY = "2026-11-18";

describe("feedChips", () => {
  it("counts what's still available, in canonical order", () => {
    const items = [
      item({ category: "Kitchen" }),
      item({ category: "Furniture" }),
      item({ category: "Furniture", status: "claimed" }),
      item({ category: "Lamps??" }), // unknown → Other
      item({ category: "Kitchen", isFree: true, priceCents: 0 }),
    ];
    const chips = feedChips(items);
    expect(chips.map((c) => `${c.label} ${c.count}`)).toEqual(["All 4", "Free 1", "Furniture 1", "Kitchen 2", "Other 1"]);
  });
  it("keeps a category whose items are all claimed, at 0", () => {
    expect(feedChips([item({ category: "Decor", status: "claimed" })]).find((c) => c.key === "Decor")?.count).toBe(0);
  });
  it("has no Free chip when nothing is free", () => {
    expect(feedChips([item({})]).some((c) => c.key === "free")).toBe(false);
  });
});

describe("matchesChip", () => {
  it("treats a missing price as free", () => {
    expect(matchesChip(item({ priceCents: null }), "free")).toBe(true);
    expect(matchesChip(item({}), "free")).toBe(false);
  });
});

describe("splitFeed", () => {
  it("puts available first by date, then claimed before sold", () => {
    const items = [
      item({ id: "later", availableFrom: "2026-12-15" }),
      item({ id: "sold", status: "picked_up" }),
      item({ id: "now" }),
      item({ id: "claimed", status: "claimed" }),
      item({ id: "past", availableFrom: "2026-01-01" }),
    ];
    const { available, gone } = splitFeed(items, "all", TODAY);
    expect(available.map((i) => i.id)).toEqual(["now", "past", "later"]);
    expect(gone.map((i) => i.id)).toEqual(["claimed", "sold"]);
  });
  it("applies the chip to both lists", () => {
    const items = [item({ id: "a", category: "Kitchen" }), item({ id: "b", category: "Decor", status: "claimed" })];
    const { available, gone } = splitFeed(items, "Kitchen", TODAY);
    expect(available.map((i) => i.id)).toEqual(["a"]);
    expect(gone).toEqual([]);
  });
});

describe("groupByCategory", () => {
  it("orders groups canonically with Other last", () => {
    const groups = groupByCategory([item({ category: null }), item({ category: "Kitchen" }), item({ category: "Furniture" })]);
    expect(groups.map((g) => g.category)).toEqual(["Furniture", "Kitchen", "Other"]);
  });
});

describe("goneLabel", () => {
  it("names what's there", () => {
    expect(goneLabel([item({ status: "claimed" }), item({ status: "picked_up" })])).toBe("2 claimed or sold");
    expect(goneLabel([item({ status: "claimed" })])).toBe("1 claimed");
    expect(goneLabel([item({ status: "picked_up" }), item({ status: "picked_up" })])).toBe("2 sold");
  });
});

