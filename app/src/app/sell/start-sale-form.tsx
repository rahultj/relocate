"use client";

// The start-a-sale form (design: "1 · Start a sale" on the seller flow canvas).
// Currency follows the pickup text until the seller changes it by hand.

import { useState, useTransition } from "react";
import { Calendar, Camera, Info } from "lucide-react";
import { inferCurrency } from "@/lib/currency-from-place";
import { currencySymbol, type Currency } from "@/lib/money";
import { createSale, type CreateSaleInput } from "./actions";

const CURRENCY_LABEL: Record<Currency, string> = {
  USD: "Prices in dollars",
  INR: "Prices in rupees",
};

/** Today as an ISO date in the seller's own time zone. */
function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

const pill = (on: boolean) =>
  `flex h-11 items-center gap-2 rounded-full border px-5 text-[15px] font-medium transition-colors ${
    on
      ? "border-text-primary bg-text-primary text-white"
      : "border-border-alt bg-white text-text-primary hover:bg-bg-hover"
  }`;

const input =
  "h-12 w-full rounded-[10px] border border-border-alt bg-white px-4 text-base text-text-primary outline-none focus:border-text-secondary";

export function StartSaleForm() {
  const [title, setTitle] = useState("");
  const [pickup, setPickup] = useState("");
  const [pickedCurrency, setPickedCurrency] = useState<Currency | null>(null);
  const [when, setWhen] = useState<"now" | "date">("now");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currency = pickedCurrency ?? inferCurrency(pickup);

  function submit(next: CreateSaleInput["next"]) {
    setError(null);
    startTransition(async () => {
      // On success createSale redirects, so a return value is always an error.
      const res = await createSale({
        title,
        pickup,
        currency,
        availableFrom: when === "now" ? todayIso() : date,
        next,
      });
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form
      className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-8 pt-14"
      onSubmit={(e) => {
        e.preventDefault();
        submit("camera");
      }}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-hover">mustgo</p>
      <h1 className="mt-3 font-serif text-[38px] font-semibold leading-[1.05] text-text-primary">
        Start your move-out sale
      </h1>
      <p className="mt-3 text-[15px] leading-normal text-text-secondary">
        Three quick things. Then you&apos;ll snap photos of what&apos;s going.
      </p>

      <div className="mt-8 flex flex-col gap-[22px]">
        <div className="flex flex-col gap-2">
          <label htmlFor="sale-name" className="text-sm font-medium text-text-primary">
            Name your sale
          </label>
          <input
            id="sale-name"
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Rahul & Swati's sale"
            maxLength={80}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="pickup" className="text-sm font-medium text-text-primary">
            Where&apos;s pickup?
          </label>
          <input
            id="pickup"
            className={input}
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="Dupont Circle, Washington DC"
            maxLength={120}
            required
          />
          <span className="text-[13px] text-text-secondary">
            Neighborhood is enough. Share the exact address with buyers later.
          </span>
          {pickup.trim() && (
            <div className="flex h-10 items-center justify-between rounded-[10px] bg-bg-hover pl-3 pr-1.5">
              <span className="flex items-center gap-2 text-sm text-text-primary">
                <span className="flex size-6 items-center justify-center rounded-full bg-text-primary text-[13px] font-bold text-white">
                  {currencySymbol(currency)}
                </span>
                {CURRENCY_LABEL[currency]}
              </span>
              <button
                type="button"
                onClick={() => setPickedCurrency(currency === "USD" ? "INR" : "USD")}
                className="h-8 rounded-lg px-3 text-[13px] font-medium text-brand-hover hover:bg-white/60"
              >
                Change
              </button>
            </div>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-text-primary">
            Things are available from
          </legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={pill(when === "now")} onClick={() => setWhen("now")}>
              Right now
            </button>
            <button type="button" className={pill(when === "date")} onClick={() => setWhen("date")}>
              <Calendar className="size-4" aria-hidden />
              Pick a date
            </button>
          </div>
          {when === "date" && (
            <input
              type="date"
              aria-label="Available from"
              className={input}
              value={date}
              min={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          )}
          <span className="text-[13px] text-text-secondary">
            Applies to every item. You can change one item later.
          </span>
        </fieldset>
      </div>

      <div className="min-h-8 flex-1" />

      <div className="flex items-start gap-2.5 rounded-xl border border-insight-border bg-insight-bg px-4 py-3.5 text-[13px] leading-[1.45] text-text-secondary">
        <Info className="mt-px size-[18px] shrink-0 text-ochre-dark" aria-hidden />
        <span>No account needed. We&apos;ll ask how buyers reach you before anything goes live.</span>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-crimson">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 flex h-[54px] items-center justify-center gap-2.5 rounded-full bg-brand-hover text-base font-medium text-white transition-colors hover:bg-crimson disabled:opacity-60"
      >
        <Camera className="size-5" aria-hidden />
        {pending ? "Starting…" : "Start adding items"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          // Run the same checks as the main button before submitting.
          if (e.currentTarget.form?.reportValidity()) submit("csv");
        }}
        className="mt-3.5 py-1 text-center text-sm text-text-secondary underline underline-offset-2 hover:text-text-primary disabled:opacity-60"
      >
        Have a spreadsheet? Import a CSV
      </button>
    </form>
  );
}
