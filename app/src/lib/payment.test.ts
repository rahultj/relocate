import { describe, it, expect } from "vitest";
import { itemPayment, payeeName, type PaymentListing, type PaymentItem } from "./payment";

const usd: PaymentListing = {
  currency: "USD",
  title: "Rahul's move",
  sellerContacts: [],
  defaultVenmoHandle: null,
  defaultUpiId: null,
};
const inr: PaymentListing = { ...usd, currency: "INR" };
const item: PaymentItem = {
  name: "Desk",
  priceCents: 150000,
  isFree: false,
  venmoHandle: null,
  venmoLink: null,
  upiId: null,
};

describe("itemPayment", () => {
  it("USD: uses the item's Venmo", () => {
    expect(itemPayment(usd, { ...item, venmoHandle: "theMayowa" })).toEqual({
      kind: "venmo",
      href: "https://venmo.com/u/theMayowa",
      handle: "@theMayowa",
    });
  });

  it("USD: falls back to the sale's default Venmo", () => {
    expect(itemPayment({ ...usd, defaultVenmoHandle: "rahul" }, item)?.href).toBe(
      "https://venmo.com/u/rahul",
    );
  });

  it("USD: ignores UPI", () => {
    expect(itemPayment({ ...usd, defaultUpiId: "rahul@ybl" }, { ...item, upiId: "a@ybl" })).toBeNull();
  });

  it("INR: the item's UPI ID wins over the sale default", () => {
    const p = itemPayment({ ...inr, defaultUpiId: "sale@ybl" }, { ...item, upiId: "Item@YBL" });
    expect(p).toMatchObject({ kind: "upi", id: "item@ybl" });
  });

  it("INR: falls back to the sale default and prices in rupees", () => {
    const p = itemPayment({ ...inr, defaultUpiId: "sale@ybl" }, item);
    expect(p?.href).toBe("upi://pay?pa=sale@ybl&pn=Rahul's%20move&am=1500.00&cu=INR&tn=Desk");
  });

  it("INR: free items carry no amount", () => {
    const p = itemPayment({ ...inr, defaultUpiId: "sale@ybl" }, { ...item, isFree: true, priceCents: 0 });
    expect(p?.href).not.toContain("am=");
  });

  it("INR: ignores Venmo, and an invalid UPI ID shows nothing", () => {
    expect(itemPayment(inr, { ...item, venmoHandle: "x" })).toBeNull();
    expect(itemPayment(inr, { ...item, upiId: "rahul" })).toBeNull();
  });
});

describe("payeeName", () => {
  it("prefers the primary contact's name, then any named contact, then the title", () => {
    expect(
      payeeName({
        title: "T",
        sellerContacts: [
          { name: "Rahul", value: "1" },
          { name: "Swati", value: "2", primary: true },
        ],
      }),
    ).toBe("Swati");
    expect(payeeName({ title: "T", sellerContacts: [{ value: "1" }, { name: "Rahul", value: "2" }] })).toBe(
      "Rahul",
    );
    expect(payeeName({ title: "T", sellerContacts: [{ value: "1" }] })).toBe("T");
  });
});
