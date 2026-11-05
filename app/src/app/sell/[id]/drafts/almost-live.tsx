"use client";

// "Almost live" (design: "IN · First publish: contact + UPI"). Shown once,
// before a sale's first item goes live: how buyers reach the seller and an
// optional sale-wide Venmo (USD) or UPI ID (INR), with a preview of what a
// buyer sees after claiming. Submitting saves it and publishes in one go.

import { useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { formatMoney, type Currency } from "@/lib/money";
import {
  parseFirstPublish,
  phonePrefix,
  type FirstPublishField,
  type FirstPublishForm,
} from "@/lib/first-publish";
import { publishWithContact } from "../actions";

const input =
  "h-12 w-full min-w-0 rounded-[10px] border bg-white px-4 text-base text-text-primary outline-none focus:border-text-secondary";

export function AlmostLive({
  listingId,
  currency,
  title,
  itemIds,
  first,
  onBack,
  onPublished,
}: {
  listingId: string;
  currency: Currency;
  title: string;
  itemIds: string[];
  /** The item the preview shows. */
  first: { name: string; priceCents: number | null; isFree: boolean };
  onBack: () => void;
  onPublished: (published: string[]) => void;
}) {
  const [form, setForm] = useState<FirstPublishForm>({ name: "", via: "phone", phone: "", email: "", pay: "" });
  const [bad, setBad] = useState<{ field: FirstPublishField | null; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FirstPublishForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setBad(null);
  };

  const usd = currency === "USD";
  const n = itemIds.length;
  const price = first.isFree || !first.priceCents ? null : formatMoney(first.priceCents, currency);
  const parsed = parseFirstPublish(form, currency);
  const pay = form.pay.trim().replace(/^@+/, "");
  const showPay = price != null && pay !== "" && !(bad?.field === "pay");
  const who = form.name.trim() || title;
  const reach = form.via === "email" ? form.email.trim() : form.phone.trim() && `${phonePrefix(currency)} ${form.phone.trim()}`;

  async function submit() {
    if (!parsed.ok) {
      setBad({ field: parsed.field, error: parsed.error });
      return;
    }
    setBusy(true);
    const res = await publishWithContact(listingId, itemIds, form).catch(() => null);
    setBusy(false);
    if (res?.ok) onPublished(res.published);
    else
      setBad({
        field: res && "field" in res ? res.field : null,
        error: res?.error ?? "Couldn't publish. Check your connection and try again.",
      });
  }

  const border = (f: FirstPublishField) => (bad?.field === f ? "border-crimson" : "border-border-alt");
  const err = (f: FirstPublishField) =>
    bad?.field === f && (
      <p id={`${f}-error`} role="alert" className="text-[13px] text-crimson">
        {bad.error}
      </p>
    );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg-main px-6 pb-8 pt-3"
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to drafts"
        className="-ml-1 flex size-11 items-center text-text-primary"
      >
        <ChevronLeft className="size-[22px]" aria-hidden />
      </button>
      <h1 className="mt-1 font-serif text-[34px] font-semibold leading-[1.05] text-text-primary">Almost live</h1>
      <p className="mt-2.5 text-[15px] leading-normal text-text-secondary">
        How should buyers reach you? Buyers see this on your sale page.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <label htmlFor="fp-name" className="text-sm font-medium">
          Your first name <span className="font-normal text-text-secondary">· optional</span>
        </label>
        <input
          id="fp-name"
          autoComplete="given-name"
          value={form.name}
          maxLength={40}
          onChange={(e) => set({ name: e.target.value })}
          className={`${input} border-border-alt`}
        />
      </div>

      {form.via === "phone" ? (
        <div className="mt-[18px] flex flex-col gap-2">
          <label htmlFor="fp-phone" className="text-sm font-medium">Phone number</label>
          <div className="flex gap-2">
            <span className="flex h-12 items-center rounded-[10px] border border-border-alt bg-bg-hover px-3.5 text-base">
              {phonePrefix(currency)}
            </span>
            <input
              id="fp-phone"
              type="tel"
              autoComplete="tel-national"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
              aria-invalid={bad?.field === "phone"}
              aria-describedby={bad?.field === "phone" ? "phone-error" : undefined}
              className={`${input} flex-1 ${border("phone")}`}
            />
          </div>
          {err("phone")}
          <button
            type="button"
            onClick={() => set({ via: "email" })}
            className="self-start text-[13px] text-text-secondary underline underline-offset-2"
          >
            Use an email address instead
          </button>
        </div>
      ) : (
        <div className="mt-[18px] flex flex-col gap-2">
          <label htmlFor="fp-email" className="text-sm font-medium">Email</label>
          <input
            id="fp-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            aria-invalid={bad?.field === "email"}
            aria-describedby={bad?.field === "email" ? "email-error" : undefined}
            className={`${input} ${border("email")}`}
          />
          {err("email")}
          <button
            type="button"
            onClick={() => set({ via: "phone" })}
            className="self-start text-[13px] text-text-secondary underline underline-offset-2"
          >
            Use a phone number instead
          </button>
        </div>
      )}

      <div className="mt-[18px] flex flex-col gap-2">
        <label htmlFor="fp-pay" className="text-sm font-medium">
          {usd ? "Venmo username" : "UPI ID"} <span className="font-normal text-text-secondary">· optional</span>
        </label>
        <input
          id="fp-pay"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={usd ? "@your-name" : "name@okaxis"}
          value={form.pay}
          onChange={(e) => set({ pay: e.target.value })}
          aria-invalid={bad?.field === "pay"}
          aria-describedby={bad?.field === "pay" ? "pay-error" : "pay-hint"}
          className={`${input} ${border("pay")}`}
        />
        {err("pay") || (
          <p id="pay-hint" className="text-[13px] leading-[1.45] text-text-secondary">
            Used for every item. You can set a different one per item later.
          </p>
        )}
      </div>

      <div className="mt-[18px] flex flex-col gap-2.5 rounded-[14px] border border-border-weave bg-white p-3.5">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-text-secondary">
          What a buyer sees after claiming
        </span>
        <span className="text-[15px] font-medium">
          You claimed {first.name}
          {price ? ` · ${price}` : " · Free"}
        </span>
        {showPay && (
          <span className="flex h-11 items-center justify-center rounded-full bg-text-primary text-[15px] font-medium text-white">
            {usd ? `Pay @${pay} on Venmo` : `Pay ${price} with UPI`}
          </span>
        )}
        <span className="flex min-h-11 flex-col items-center justify-center rounded-full border border-border-alt px-4 text-center text-[15px] font-medium">
          Contact {who}
          {reach && <span className="text-xs font-normal text-text-secondary">{reach}</span>}
        </span>
      </div>

      <div className="min-h-6 flex-1" />
      {bad?.field == null && bad?.error && (
        <p role="alert" className="mb-3 rounded-xl bg-brand-soft px-4 py-3 text-sm text-crimson">
          {bad.error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="flex h-[54px] items-center justify-center gap-2 rounded-full bg-brand-hover text-base font-medium text-white hover:bg-crimson disabled:opacity-60"
      >
        {busy && <Loader2 className="size-[18px] animate-spin" aria-hidden />}
        {busy ? "Publishing…" : `Publish ${n} ${n === 1 ? "item" : "items"}`}
      </button>
    </form>
  );
}
