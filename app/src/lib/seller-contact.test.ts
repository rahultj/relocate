import { describe, expect, it } from "vitest";
import { contactName } from "./seller-contact";

describe("contactName", () => {
  it("prefers the primary contact's first name", () => {
    expect(contactName([{ name: "Swati", value: "1" }, { name: "Rahul Joseph", value: "2", primary: true }])).toBe("Rahul");
  });
  it("falls back to the first named contact", () => {
    expect(contactName([{ value: "1", primary: true }, { name: "Swati", value: "2" }])).toBe("Swati");
  });
  it("says the seller when nobody is named", () => {
    expect(contactName([{ value: "202-555-0100" }])).toBe("the seller");
  });
  it("ignores contacts with no value", () => {
    expect(contactName([{ name: "Ghost", value: " ", primary: true }, { name: "Mayowa", value: "3" }])).toBe("Mayowa");
  });
});
