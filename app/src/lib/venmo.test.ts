import { describe, it, expect } from "vitest";
import { normalizeVenmo, venmoPayHref, venmoDisplayHandle } from "./venmo";

describe("normalizeVenmo", () => {
  it("strips a leading @ and derives a /u/ deep-link from the handle", () => {
    expect(normalizeVenmo({ handle: "@theMayowa" })).toEqual({
      handle: "theMayowa",
      link: "https://venmo.com/u/theMayowa",
    });
  });

  it("rewrites an old-format link (no /u/) into the /u/ deep-link", () => {
    expect(normalizeVenmo({ link: "venmo.com/theMayowa" })).toEqual({
      handle: null,
      link: "https://venmo.com/u/theMayowa",
    });
  });

  it("leaves an already-correct /u/ link unchanged", () => {
    expect(normalizeVenmo({ link: "https://venmo.com/u/theMayowa" })).toEqual({
      handle: null,
      link: "https://venmo.com/u/theMayowa",
    });
  });

  it("prefers the handle when both a handle and a link are given", () => {
    // Mayowa's CSV carries Venmo (@handle) + Venmo Link; the handle is the
    // source of truth, so the link is rebuilt as /u/<handle>.
    expect(
      normalizeVenmo({ handle: "@x", link: "venmo.com/somethingelse" }),
    ).toEqual({
      handle: "x",
      link: "https://venmo.com/u/x",
    });
  });

  it("extracts the username from an account.venmo.com/u/ link when there's no handle", () => {
    expect(normalizeVenmo({ link: "https://account.venmo.com/u/scooby" })).toEqual({
      handle: null,
      link: "https://venmo.com/u/scooby",
    });
  });

  it("keeps a non-venmo URL as-is (prepending a scheme)", () => {
    expect(normalizeVenmo({ link: "paypal.me/pool" })).toEqual({
      handle: null,
      link: "https://paypal.me/pool",
    });
  });

  it("returns nulls for empty / whitespace input", () => {
    expect(normalizeVenmo({ handle: "  ", link: "" })).toEqual({
      handle: null,
      link: null,
    });
    expect(normalizeVenmo({})).toEqual({ handle: null, link: null });
  });
});

describe("venmoPayHref / venmoDisplayHandle", () => {
  it("returns the /u/ pay href and display handle", () => {
    expect(venmoPayHref({ handle: "@theMayowa" })).toBe("https://venmo.com/u/theMayowa");
    expect(venmoDisplayHandle({ handle: "@theMayowa" })).toBe("@theMayowa");
  });
  it("returns null when unset", () => {
    expect(venmoPayHref({})).toBeNull();
    expect(venmoDisplayHandle({ link: "venmo.com/pool" })).toBeNull();
  });
});
