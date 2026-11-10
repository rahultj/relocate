import { describe, expect, it } from "vitest";
import {
  filterCounts,
  homeStatus,
  matchesFilter,
  openClaimCount,
  statusLine,
  type HomeItemState,
} from "./seller-home";

const base: HomeItemState = { listed: true, sold: false, claimant: null, waiting: 0 };

describe("homeStatus + statusLine", () => {
  it("is Available for a listed, unclaimed item", () => {
    expect(statusLine(homeStatus(base))).toBe("Available");
  });

  it("names the claimant and the waitlist", () => {
    expect(statusLine(homeStatus({ ...base, claimant: "Sam", waiting: 2 }))).toBe(
      "Claimed by Sam · 2 waiting",
    );
    expect(statusLine(homeStatus({ ...base, claimant: "Sam" }))).toBe("Claimed by Sam");
  });

  it("drops a blank claimant name", () => {
    expect(statusLine(homeStatus({ ...base, claimant: " " }))).toBe("Claimed");
  });

  it("shows waiters on an item with no claim", () => {
    expect(statusLine(homeStatus({ ...base, waiting: 1 }))).toBe("Available · 1 waiting");
  });

  it("puts Sold over Hidden over claims", () => {
    expect(homeStatus({ ...base, sold: true, listed: false, claimant: "Sam" })).toEqual({ kind: "sold" });
    expect(homeStatus({ ...base, listed: false, claimant: "Sam" })).toEqual({ kind: "hidden" });
  });
});

describe("filters and counts", () => {
  const statuses = [
    homeStatus(base),
    homeStatus(base),
    homeStatus({ ...base, waiting: 1 }),
    homeStatus({ ...base, claimant: "Sam" }),
    homeStatus({ ...base, listed: false }),
    homeStatus({ ...base, sold: true }),
  ];

  it("counts Available and Hidden chips", () => {
    expect(filterCounts(statuses)).toEqual({ available: 3, hidden: 1 });
  });

  it("filters by kind, All keeps everything", () => {
    expect(statuses.filter((s) => matchesFilter(s, "all"))).toHaveLength(6);
    expect(statuses.filter((s) => matchesFilter(s, "available"))).toHaveLength(3);
    expect(statuses.filter((s) => matchesFilter(s, "hidden"))).toHaveLength(1);
  });

  it("counts open claim activity like the /manage overview", () => {
    expect(openClaimCount(statuses)).toBe(2);
    expect(openClaimCount([homeStatus({ ...base, listed: false, claimant: "Sam" })])).toBe(0);
  });
});
