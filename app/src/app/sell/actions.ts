"use server";

// Start-a-sale action for /sell. Creates an empty listing from the three
// sale-wide answers, then redirects to the seller's private link. The listing
// UUID is the capability, the same model as /manage/[id].

import { redirect } from "next/navigation";
import { db } from "@/db";
import { listings } from "@/db/schema";
import { insertWithUniqueSlug } from "@/lib/listing-insert";
import { CURRENCIES, type Currency } from "@/lib/money";

export interface CreateSaleInput {
  title: string;
  pickup: string;
  currency: Currency;
  availableFrom: string; // ISO date, computed in the seller's time zone
  next: "camera" | "csv";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createSale(
  input: CreateSaleInput,
): Promise<{ ok: false; error: string }> {
  const title = input.title.trim().slice(0, 80);
  const pickup = input.pickup.trim().slice(0, 120);
  if (!title) return { ok: false, error: "Give your sale a name." };
  if (!pickup) return { ok: false, error: "Add where buyers pick up." };
  if (!CURRENCIES.includes(input.currency)) {
    return { ok: false, error: "Pick a currency." };
  }
  if (!ISO_DATE.test(input.availableFrom)) {
    return { ok: false, error: "Pick when things are available." };
  }

  let id: string;
  try {
    const [listing] = await insertWithUniqueSlug((slug) =>
      db
        .insert(listings)
        .values({
          slug,
          title,
          // One free-text pickup field, kept as typed; the buyer header shows
          // it unchanged when neighborhood is null.
          city: pickup,
          currency: input.currency,
          pickupFrom: input.availableFrom,
        })
        .returning({ id: listings.id }),
    );
    id = listing.id;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't start the sale — please retry.",
    };
  }

  // Outside the try: redirect() works by throwing.
  redirect(input.next === "csv" ? `/manage/${id}#import` : `/sell/${id}`);
}
