import { describe, it, expect } from "vitest";
import { normalizeContact, contactHref } from "./contact";

describe("contactHref", () => {
  it("builds an sms: link for phones (SMS is the medium)", () => {
    expect(contactHref("(202) 555-0147")).toBe("sms:2025550147");
    expect(contactHref("+1 617 230 7788")).toBe("sms:+16172307788");
  });
  it("builds a mailto: link for emails", () => {
    expect(contactHref("Priya@Gmail.com")).toBe("mailto:priya@gmail.com");
  });
  it("returns null for junk", () => {
    expect(contactHref("nope@")).toBeNull();
    expect(contactHref("123")).toBeNull();
    expect(contactHref("")).toBeNull();
  });
});

describe("normalizeContact", () => {
  it("detects and lowercases emails", () => {
    expect(normalizeContact("Priya@Gmail.com")).toEqual({
      contact: "priya@gmail.com",
      type: "email",
    });
    expect(normalizeContact("  a@b.co ")).toEqual({
      contact: "a@b.co",
      type: "email",
    });
  });

  it("dedupes: case + whitespace variants of an email normalize equal", () => {
    expect(normalizeContact("A@x.com")).toEqual(normalizeContact(" a@x.com "));
  });

  it("rejects malformed emails (has @ but not a valid shape)", () => {
    expect(normalizeContact("nope@")).toBeNull();
    expect(normalizeContact("@nope.com")).toBeNull();
    expect(normalizeContact("a@b")).toBeNull();
  });

  it("normalizes phones: strips formatting, keeps leading +", () => {
    expect(normalizeContact("(202) 555-0147")).toEqual({
      contact: "2025550147",
      type: "phone",
    });
    expect(normalizeContact("+1 202-555-0147")).toEqual({
      contact: "+12025550147",
      type: "phone",
    });
  });

  it("dedupes: formatted and bare phone normalize equal", () => {
    expect(normalizeContact("202.555.0147")).toEqual(
      normalizeContact("2025550147"),
    );
  });

  it("rejects too-short / junk", () => {
    expect(normalizeContact("12345")).toBeNull(); // < 7 digits
    expect(normalizeContact("")).toBeNull();
    expect(normalizeContact("   ")).toBeNull();
    expect(normalizeContact("???")).toBeNull();
  });
});
