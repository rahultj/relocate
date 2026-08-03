import { describe, it, expect } from "vitest";
import { normalizeVenmo, venmoPayHref, venmoDisplayHandle } from "./venmo";

describe("normalizeVenmo", () => {
  it("strips a leading @ and derives the link from the handle", () => {
    expect(normalizeVenmo({ handle: "@theMayowa" })).toEqual({
      handle: "theMayowa",
      link: "https://venmo.com/theMayowa",
    });
  });

  it("prepends a scheme to a bare link", () => {
    expect(normalizeVenmo({ handle: "@x", link: "venmo.com/theMayowa" })).toEqual({
      handle: "x",
      link: "https://venmo.com/theMayowa",
    });
  });

  it("keeps an explicit https link as-is", () => {
    expect(
      normalizeVenmo({ handle: "scoobydoomansion", link: "https://account.venmo.com/u/scooby" }),
    ).toEqual({
      handle: "scoobydoomansion",
      link: "https://account.venmo.com/u/scooby",
    });
  });

  it("returns nulls for empty / whitespace input", () => {
    expect(normalizeVenmo({ handle: "  ", link: "" })).toEqual({
      handle: null,
      link: null,
    });
    expect(normalizeVenmo({})).toEqual({ handle: null, link: null });
  });

  it("supports a link with no handle", () => {
    expect(normalizeVenmo({ link: "venmo.com/pool" })).toEqual({
      handle: null,
      link: "https://venmo.com/pool",
    });
  });
});

describe("venmoPayHref / venmoDisplayHandle", () => {
  it("returns the pay href and display handle", () => {
    expect(venmoPayHref({ handle: "@theMayowa" })).toBe("https://venmo.com/theMayowa");
    expect(venmoDisplayHandle({ handle: "@theMayowa" })).toBe("@theMayowa");
  });
  it("returns null when unset", () => {
    expect(venmoPayHref({})).toBeNull();
    expect(venmoDisplayHandle({ link: "venmo.com/pool" })).toBeNull();
  });
});
