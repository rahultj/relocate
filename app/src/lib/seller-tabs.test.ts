import { describe, expect, it } from "vitest";
import { tabFromPath, tabFromSegments, tabHref } from "./seller-tabs";

const base = "/sell/4463d1c7-27e9-4e48-9552-c79602304461";

describe("tabFromSegments", () => {
  it("reads the catch-all's segments", () => {
    expect(tabFromSegments(undefined)).toBe("items");
    expect(tabFromSegments([])).toBe("items");
    expect(tabFromSegments(["claims"])).toBe("claims");
    expect(tabFromSegments(["sale"])).toBe("sale");
  });
  it("rejects anything else, so the page 404s", () => {
    expect(tabFromSegments(["items"])).toBeNull();
    expect(tabFromSegments(["claims", "x"])).toBeNull();
    expect(tabFromSegments(["nope"])).toBeNull();
  });
});

describe("tabFromPath", () => {
  it("maps the sale's addresses to tabs", () => {
    expect(tabFromPath(base, base)).toBe("items");
    expect(tabFromPath(`${base}/`, base)).toBe("items");
    expect(tabFromPath(`${base}/claims`, base)).toBe("claims");
    expect(tabFromPath(`${base}/sale/`, base)).toBe("sale");
  });
  it("ignores other sales and other pages", () => {
    expect(tabFromPath(`${base}x/claims`, base)).toBeNull();
    expect(tabFromPath(`${base}/drafts`, base)).toBeNull();
  });
  it("round-trips with tabHref", () => {
    for (const t of ["items", "claims", "sale"] as const) expect(tabFromPath(tabHref(base, t), base)).toBe(t);
  });
});
