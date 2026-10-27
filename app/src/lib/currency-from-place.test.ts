import { describe, it, expect } from "vitest";
import { inferCurrency } from "./currency-from-place";

describe("inferCurrency", () => {
  it("is INR for Indian cities, states and the country", () => {
    expect(inferCurrency("Indiranagar, Bengaluru")).toBe("INR");
    expect(inferCurrency("Bandra West, Mumbai")).toBe("INR");
    expect(inferCurrency("Gurgaon")).toBe("INR");
    expect(inferCurrency("Kerala")).toBe("INR");
    expect(inferCurrency("near Connaught Place, New Delhi")).toBe("INR");
    expect(inferCurrency("India")).toBe("INR");
  });
  it("is case- and punctuation-insensitive", () => {
    expect(inferCurrency("  KORAMANGALA,BANGALORE ")).toBe("INR");
    expect(inferCurrency("HSR-Layout")).toBe("INR");
  });
  it("treats a 6-digit PIN code as India", () => {
    expect(inferCurrency("Sector 18, 201301")).toBe("INR");
  });
  it("is USD for US places", () => {
    expect(inferCurrency("Dupont Circle, Washington DC")).toBe("USD");
    expect(inferCurrency("Brooklyn, NY 11201")).toBe("USD");
    expect(inferCurrency("")).toBe("USD");
  });
  it("doesn't match India inside other words", () => {
    expect(inferCurrency("Bloomington, Indiana")).toBe("USD");
    expect(inferCurrency("Indianapolis")).toBe("USD");
  });
});
