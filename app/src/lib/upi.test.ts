import { describe, it, expect } from "vitest";
import { normalizeUpi, isValidUpi, upiPayHref } from "./upi";

describe("normalizeUpi", () => {
  it("trims, drops inner spaces and lowercases", () => {
    expect(normalizeUpi("  Rahul.J @OkHDFCbank ")).toBe("rahul.j@okhdfcbank");
  });

  it("returns null for empty input", () => {
    expect(normalizeUpi("")).toBeNull();
    expect(normalizeUpi("   ")).toBeNull();
    expect(normalizeUpi(null)).toBeNull();
  });
});

describe("isValidUpi", () => {
  it("accepts name@handle", () => {
    expect(isValidUpi("rahul.j@okhdfcbank")).toBe(true);
    expect(isValidUpi("9876543210@ybl")).toBe(true);
  });

  it("rejects things that aren't UPI IDs", () => {
    expect(isValidUpi("rahul")).toBe(false);
    expect(isValidUpi("@ybl")).toBe(false);
    expect(isValidUpi("rahul@")).toBe(false);
    expect(isValidUpi("a@b@c")).toBe(false);
  });
});

describe("upiPayHref", () => {
  it("builds a full pay link with amount in rupees and an encoded name", () => {
    expect(
      upiPayHref({ id: "rahul@okhdfcbank", amountMinor: 150000, payeeName: "Rahul J", note: "Desk" }),
    ).toBe("upi://pay?pa=rahul@okhdfcbank&pn=Rahul%20J&am=1500.00&cu=INR&tn=Desk");
  });

  it("leaves the amount out for free or unpriced items", () => {
    expect(upiPayHref({ id: "rahul@ybl", amountMinor: 0 })).toBe("upi://pay?pa=rahul@ybl&cu=INR");
    expect(upiPayHref({ id: "rahul@ybl", amountMinor: null })).toBe("upi://pay?pa=rahul@ybl&cu=INR");
  });

  it("returns null for an invalid ID", () => {
    expect(upiPayHref({ id: "not-a-upi" })).toBeNull();
  });
});
