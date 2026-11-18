import { describe, expect, it } from "vitest";
import {
  isoToMonth,
  makeCover,
  monthToIso,
  paidToSummary,
  removePhoto,
  sheetConditions,
  venmoUsername,
} from "./item-sheet";

describe("sheetConditions", () => {
  it("shows the draft queue's three conditions", () => {
    expect(sheetConditions("good")).toEqual(["like_new", "good", "fair"]);
    expect(sheetConditions(null)).toEqual(["like_new", "good", "fair"]);
  });
  it("adds New or Worn only when the item already has it", () => {
    expect(sheetConditions("new")).toEqual(["new", "like_new", "good", "fair"]);
    expect(sheetConditions("worn")).toEqual(["like_new", "good", "fair", "worn"]);
  });
});

describe("venmoUsername", () => {
  it("prefers the handle", () => {
    expect(venmoUsername({ venmoHandle: "@rahul-j", venmoLink: null })).toBe("rahul-j");
  });
  it("falls back to the username in a venmo.com link", () => {
    expect(venmoUsername({ venmoHandle: null, venmoLink: "venmo.com/u/mayowa" })).toBe("mayowa");
  });
  it("is null with neither", () => {
    expect(venmoUsername({ venmoHandle: null, venmoLink: null })).toBeNull();
  });
});

describe("paidToSummary", () => {
  const none = { venmoHandle: null, venmoLink: null, upiId: null };
  it("shows the item's own Venmo", () => {
    expect(paidToSummary({ ...none, venmoHandle: "sam" }, { venmo: "rahul", upi: null }, "USD")).toBe("Venmo @sam");
  });
  it("falls back to the sale default", () => {
    expect(paidToSummary(none, { venmo: "@rahul", upi: null }, "USD")).toBe("Venmo @rahul (sale default)");
  });
  it("uses UPI on rupee sales", () => {
    expect(paidToSummary(none, { venmo: "rahul", upi: "rahul@okhdfc" }, "INR")).toBe("UPI rahul@okhdfc (sale default)");
    expect(paidToSummary({ ...none, upiId: "a@ybl" }, { venmo: null, upi: null }, "INR")).toBe("UPI a@ybl");
  });
  it("says Not set when nothing is set", () => {
    expect(paidToSummary(none, { venmo: null, upi: null }, "USD")).toBe("Not set");
    expect(paidToSummary(none, { venmo: null, upi: null }, "INR")).toBe("Not set");
  });
});

describe("month inputs", () => {
  it("round-trips a bought date as a month", () => {
    expect(isoToMonth("2022-03-15")).toBe("2022-03");
    expect(monthToIso("2022-03")).toBe("2022-03-01");
  });
  it("treats empty as no date", () => {
    expect(isoToMonth(null)).toBe("");
    expect(monthToIso("")).toBeNull();
  });
});

describe("photo edits", () => {
  const urls = ["a", "b", "c"];
  it("removes a photo", () => {
    expect(removePhoto(urls, "b")).toEqual(["a", "c"]);
  });
  it("never removes the last photo", () => {
    expect(removePhoto(["a"], "a")).toEqual(["a"]);
  });
  it("moves a photo to the cover", () => {
    expect(makeCover(urls, "c")).toEqual(["c", "a", "b"]);
    expect(makeCover(urls, "zz")).toEqual(urls);
  });
});
