import { describe, it, expect } from "vitest";
import { mintSlug, toVanitySlug, isValidVanitySlug } from "./slug";

describe("mintSlug", () => {
  it("is the requested length and uses the unambiguous alphabet", () => {
    expect(mintSlug(4)).toHaveLength(4);
    expect(mintSlug(6)).toMatch(/^[abcdefghjkmnpqrstvwxyz23456789]+$/);
  });
});

describe("toVanitySlug", () => {
  it("lowercases and hyphenates free text", () => {
    expect(toVanitySlug("Rahul & Swati's Ghar Waapsi")).toBe(
      "rahul-swati-s-ghar-waapsi",
    );
    expect(toVanitySlug("  Ghar  Waapsi!! ")).toBe("ghar-waapsi");
  });
  it("collapses and trims hyphens", () => {
    expect(toVanitySlug("--a__b--")).toBe("a-b");
    expect(toVanitySlug("a   b   c")).toBe("a-b-c");
  });
});

describe("isValidVanitySlug", () => {
  it("accepts clean word-slugs", () => {
    expect(isValidVanitySlug("ghar-waapsi")).toBe(true);
    expect(isValidVanitySlug("sale2026")).toBe(true);
    expect(isValidVanitySlug("abc")).toBe(true);
  });
  it("rejects bad shapes", () => {
    expect(isValidVanitySlug("ab")).toBe(false); // too short
    expect(isValidVanitySlug("-lead")).toBe(false);
    expect(isValidVanitySlug("trail-")).toBe(false);
    expect(isValidVanitySlug("dou--ble")).toBe(false);
    expect(isValidVanitySlug("Caps")).toBe(false);
    expect(isValidVanitySlug("has space")).toBe(false);
    expect(isValidVanitySlug("a".repeat(41))).toBe(false); // too long
  });
  it("rejects reserved route words", () => {
    expect(isValidVanitySlug("manage")).toBe(false);
    expect(isValidVanitySlug("seller")).toBe(false);
  });
  it("toVanitySlug output is always valid (when non-empty, ≥3)", () => {
    const s = toVanitySlug("Rahul & Swati's Ghar Waapsi");
    expect(isValidVanitySlug(s)).toBe(true);
  });
});
