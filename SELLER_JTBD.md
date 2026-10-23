# Seller jobs to be done

I'm rebuilding the seller side of mustgo for **strangers who find it**, not just me and friends I can coach. They arrive cold, can't ask me anything, may be on a phone, and may never have made a CSV. The seller side today is hard to use. This doc says what sellers are trying to get done, so the design follows from it.

## The jobs

| # | As a seller, I want to… | Today |
|---|---|---|
| 1 | **Create a move-out sale as quickly as possible.** | `/seller/add` is built around CSV. Without one, you fill in rows by hand and a "Listing details" form, then publish. The `/manage` link is shown once, and it's the only way back. |
| 2 | **Upload a batch of pictures and have AI work out what each item is and categorize it.** | The bulk photo matcher only matches photos to items that *already exist*, by filename. No AI. Category is guessed from the item *name* (`suggestCategory`), never from a photo. |
| 3 | **Fill in the missing details (price, description, date available, etc.) as easily as possible.** | Edit one inline field at a time on `/manage`, or export the CSV, edit it, and re-import. Nothing shows what's still missing. |
| 4 | **Upload one picture at a time.** | Add a row, then attach a photo to it. It works on desktop, but it isn't built around the phone camera. |

The flow these describe: **photos in → AI drafts the items → I fill the gaps → publish.** Photos come first; the CSV becomes optional.

## Decided

- **Mobile first.** People take photos with their phone camera.
- **CSV stays as a backup**, not the main flow.
- **AI output lands as drafts.** Nothing AI-written goes live until the seller has checked it.
- **A sale goes live with whatever's ready**, even one item. Drafts stay hidden.
- **AI drafts** the name, category, a short description and a suggested price. In v1, one photo is one item (more photos can be added to it).
- **Required to go live:** photo, name, price ("Free" counts). Date and pickup come from sale-wide defaults.
- **Getting back to a sale** is a separate job, outside this rewrite.
- **US and India both launch.** Currency is set per sale from the pickup location ($ or ₹, changeable) and formatted locally (₹1,50,000).
- **v1 is listing and claims only.** No messaging (SMS/WhatsApp) in v1. Sellers give a phone or email; buyers who claim can contact them, as today.
- **UPI for India, with parity to Venmo:** an optional sale-wide UPI ID at first publish, overridable per item. Buyers get "Pay ₹X with UPI" after claiming.
- **No cost question or price guidance in v1.** Price is quick buttons per category in the sale's currency, with Free first, plus Other. Guidance waits for real sales data from both markets.
- **Flow first, then visuals.** Iterate on `SELLER_FLOW.md` before any mockups.

## Ideas to make it easier (brainstorm)

- **Voice notes per item.** After a photo, say "IKEA couch, bought 2022 for $600, asking $200, available from the 1st", and AI turns it into fields. Cheapest version: one free-text "Tell us about it" box, which the phone keyboard's mic already dictates into, parsed by AI. A dedicated mic button can come later.
- **Sale-wide defaults.** Set pickup location, "everything available from Dec 1", and default condition once, so items don't each ask for them.
- **One question at a time.** A review queue of drafts where each card asks only what's missing, with quick answers (price chips: Free / $5 / $10 / $20 / AI's suggestion).
- **AI price suggestion** from the photo and the voice note. Accept in one tap.
- **Publish what's ready.** Incomplete items stay drafts; the sale goes live anyway.
- **Snap the label.** A photo of a brand or model sticker fills in the description.

## What the AI test showed (2026-10-23)

40 of my real item photos, drafted blind and scored against my real listings: 10 from `Trial Pictures/`, 30 from `/r/swahul`.

- **What the item is: 39/40.** The only miss was a cluttered desk photo, where it listed the chair instead. When there were several things in a photo, it said so.
- **Brand from a visible logo: 7/7.** Brand guessed from the design: mostly right, but once it was confidently wrong (it called a Target lamp "Xiaomi").
- **Condition: 0/2 of my noted defects caught.** It called a "never used" bag "Good".
- **Price: about 1.4x what I asked, and almost never Free.** I gave away about half my items.
- **My actual pricing:** if it cost under ~$75 new, I made it Free. Otherwise I asked about 25% of what I paid.

**Design rules that follow:**
1. The AI drafts the name, category and a plain description. No selling points it can't see.
2. Brand only from a visible logo. A design-based guess becomes a "Looks like X?" chip the seller confirms.
3. The seller always picks condition.
4. **No AI price guess.** In v1 the seller picks from quick price buttons. (Pricing guidance from what they paid, roughly Free under $75 and ~25% otherwise, is parked until there's data from both markets.)
5. Ask "Which one are you selling?" only when the AI flags a photo as showing several things.

## Not in this rewrite (yet)

Earlier seed jobs that aren't on the list above: sharing to WhatsApp/Facebook, claim notifications, handoff list and flakes (waitlist promotion), payment tracking, bulk price drops near move day, total earned. The current `/manage` features for these keep working; they're just not what the rewrite is built around.
