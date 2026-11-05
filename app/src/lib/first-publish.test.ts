import { describe, expect, it } from "vitest";
import { needsFirstPublish, parseFirstPublish, type FirstPublishForm } from "./first-publish";

const form = (f: Partial<FirstPublishForm>): FirstPublishForm => ({
  name: "",
  via: "phone",
  phone: "",
  email: "",
  pay: "",
  ...f,
});

describe("needsFirstPublish", () => {
  it("is true with no usable contact", () => {
    expect(needsFirstPublish(null)).toBe(true);
    expect(needsFirstPublish([])).toBe(true);
    expect(needsFirstPublish([{ value: "  " }, { value: "nope" }])).toBe(true);
  });

  it("is false once a phone or email is set", () => {
    expect(needsFirstPublish([{ value: "+1 202 555 0143" }])).toBe(false);
    expect(needsFirstPublish([{ value: "a@b.co" }])).toBe(false);
  });
});

describe("parseFirstPublish", () => {
  it("prefixes the country code by currency", () => {
    const us = parseFirstPublish(form({ phone: "202 555 0143", name: " Rahul " }), "USD");
    expect(us).toMatchObject({ ok: true, contact: { name: "Rahul", value: "+1 202 555 0143", primary: true } });
    const ind = parseFirstPublish(form({ phone: "98450  12345" }), "INR");
    expect(ind).toMatchObject({ ok: true, contact: { value: "+91 98450 12345" } });
  });

  it("keeps a number typed with its own country code", () => {
    expect(parseFirstPublish(form({ phone: "+44 7700 900123" }), "USD")).toMatchObject({
      contact: { value: "+44 7700 900123" },
    });
  });

  it("rejects a short or missing phone", () => {
    expect(parseFirstPublish(form({ phone: "" }), "USD")).toMatchObject({ ok: false, field: "phone" });
    expect(parseFirstPublish(form({ phone: "12345" }), "USD")).toMatchObject({ ok: false, field: "phone" });
  });

  it("uses the email when chosen", () => {
    expect(parseFirstPublish(form({ via: "email", email: " Me@Example.com ", phone: "x" }), "USD")).toMatchObject({
      ok: true,
      contact: { value: "me@example.com" },
    });
    expect(parseFirstPublish(form({ via: "email", email: "me@" }), "USD")).toMatchObject({ ok: false, field: "email" });
  });

  it("takes a Venmo username on USD sales", () => {
    const r = parseFirstPublish(form({ phone: "2025550143", pay: "@rahul-joseph" }), "USD");
    expect(r).toMatchObject({ ok: true, defaultVenmoHandle: "rahul-joseph", defaultUpiId: null });
    expect(parseFirstPublish(form({ phone: "2025550143", pay: "venmo.com/u/rj_42" }), "USD")).toMatchObject({
      defaultVenmoHandle: "rj_42",
    });
    expect(parseFirstPublish(form({ phone: "2025550143", pay: "not a handle" }), "USD")).toMatchObject({
      ok: false,
      field: "pay",
    });
  });

  it("takes a UPI ID on INR sales", () => {
    const r = parseFirstPublish(form({ phone: "9845012345", pay: "Priya@OKAXIS" }), "INR");
    expect(r).toMatchObject({ ok: true, defaultUpiId: "priya@okaxis", defaultVenmoHandle: null });
    expect(parseFirstPublish(form({ phone: "9845012345", pay: "priya" }), "INR")).toMatchObject({
      ok: false,
      field: "pay",
    });
  });

  it("leaves payment unset when blank", () => {
    expect(parseFirstPublish(form({ phone: "9845012345" }), "INR")).toMatchObject({
      defaultUpiId: null,
      defaultVenmoHandle: null,
    });
  });
});
