# Seller v1: build plan

The new photo-first seller flow, built in slices I can test on my phone. Design: the "mustgo seller flow" canvas (https://claude.ai/artifact/MYnpD3ftM88552ZDMfvZCd). Jobs and decisions: `SELLER_JTBD.md`. **Status:** slices 0–3 done (schema live, #17, #18, #19). Slice 4 is in progress.

## What v1 is

Listing and claims, for US and India sales:

start a sale → snap photos (+ one sentence) → AI drafts each item → finish drafts in a queue → first publish (contact + Venmo/UPI) → seller home.

Claims keep using the existing flow and `/manage`.

**Not in v1:** messaging (SMS/WhatsApp), price guidance, getting back to a lost sale, a redesigned claims view, and the dedicated mic button (keyboard dictation covers it).

## Before I start

1. **`app/.env.local` on this Mac.** Copy it from the other machine or rebuild it from the Supabase dashboard (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`).
2. **`ANTHROPIC_API_KEY`** in `.env.local` and in Vercel (Production). It's server-only, never `NEXT_PUBLIC_`.
3. **Approve the schema change below.** Dev and prod share one database, so it lands on the live site, though it's additive only.

## Data changes (one raw-SQL script, `scripts/add-seller-v1-columns.mjs`)

`db:push` is broken, so update `schema.ts` and apply the SQL by hand, run from `app/`.

| Table | Column | Why |
|---|---|---|
| `listings` | `currency text not null default 'USD'` (check `USD`/`INR`) | Currency is per sale. Existing sales stay USD with no backfill. |
| `listings` | `default_venmo_handle text`, `default_upi_id text` | Sale-wide payment default set at first publish. Items can override it. |
| `items` | `upi_id text` | Per-item UPI, the same as per-item Venmo. |
| `items` | `draft boolean not null default false` | AI drafts are hidden from buyers. Kept separate from `unlisted` because unlisted items still resolve ("No longer available"), while drafts should 404 to buyers. |
| `items` | `seller_note text` | The "Tell us about it" sentence, kept for re-drafting. |
| `items` | `ai_draft jsonb` | Raw AI output: brand guess, ambiguity flag and candidates, which fields came from the note vs the photo. |

`price_cents` keeps its name but now means **minor units of the sale's currency** (cents or paise). Document it in `schema.ts` and update CLAUDE.md's "Currency: USD" rule.

## Slices

Each slice ships on its own and is testable. The first two are worth doing before the new flow exists.

### 0. AI check on the production model (go/no-go)
Rerun the 40-photo test (in the scratchpad `ai-test/` folder) through the API on the model the app will actually use: try Haiku first, then Sonnet if Haiku is weak. Check that naming, category, ambiguity flags and "brand only from a logo" still hold. Log cost and time per item.

**Result: go** with `claude-haiku-5-5` at effort `medium`. It named 38 of 40 right, at about $0.0005 and 4s per item. "Which one are you selling?" detection was unreliable (3 of 40), so the seller's note and the draft-card review are the real safety net.

### 1. Currency plumbing (no visible change for US sales)
- `lib/money.ts`: `formatMoney(minor, currency)` with `Intl.NumberFormat` (`en-US` for USD, `en-IN` for INR, giving ₹1,50,000) plus a currency-aware parse. It replaces `formatPrice` in `lib/format.ts`.
- Replace the hardcoded `$` in `r/[slug]/listing-feed.tsx:390`, `r/[slug]/share/page.tsx:148`, `seller/add/bulk-add-client.tsx:583` and `manage/[id]/listing-editor.tsx:1324`, plus the item detail page.
- Dates use the sale's locale ("14 Jun 2026" for INR sales).
- Tests: USD output unchanged; INR grouping right.

### 2. UPI, with parity to Venmo
- `lib/upi.ts`: `normalizeUpi`, and `upiPayHref(id, amount, payeeName)` producing `upi://pay?pa=…&pn=…&am=…&cu=INR`. It mirrors `lib/venmo.ts`.
- The claim confirmation (`r/[slug]/[itemId]/claim-button.tsx`) shows "Pay ₹X with UPI" where Venmo appears today. The item's `upi_id` wins over the listing default. Add a "copy UPI ID" fallback, since `upi://` links are unreliable on iOS.
- `/manage` gets a per-item UPI field next to `@venmo`. The CSV gets a `upi` column alias.
- **Gotcha:** a UPI ID contains `@`, so it must never go through `normalizeContact` (it would be treated as an email).

### 3. New route: start a sale (`/sell`)

The "Start your move-out sale" screen from the canvas (`Main` / `IndiaStart` artboards), built as designed.

**Decisions**
- **One seller link.** `/sell/[id]` is the only link a seller is given and told to bookmark. `/manage/[id]` stays as the claims and power-user surface, reached from it. Existing `/manage` bookmarks (mine, Mayowa's) keep working.
- **CSV lives in `/manage`.** "Have a spreadsheet? Import a CSV" submits the same three answers, creates the sale, then opens `/manage/[id]` at the import section. `/seller/add` is retired: it 308-redirects to `/sell`, and the landing CTA points at `/sell`. Deleting its code waits until slice 4 ships, since its photo helpers are still shared.

**Screen (`app/src/app/sell/{page,start-sale-form,actions}.tsx`)**
- **Name your sale** (required, text).
- **Where's pickup?** (required, one text field), with the hint "Neighborhood is enough…". It's stored as typed in `listings.city`, and `neighborhood` stays null, so the buyer header shows it unchanged.
- **Currency chip** under pickup, once pickup has text: "₹ Prices in rupees" or "$ Prices in dollars", with **Change**, which toggles between them. Once the seller picks one by hand, typing no longer changes it. (The canvas shows the chip only on the India screen; I show it for both so a US seller can also see it and fix it.)
- **Things are available from:** "Right now" (the default, today in the browser's time zone) or "Pick a date" (a native date input). Saved to `listings.pickupFrom`, the sale-wide default the camera loop will copy onto each item's `availableFrom`.
- The ochre "No account needed…" note, then **Start adding items** (brand button), then the CSV link.
- Mobile first at 375px+, using existing tokens (`bg-brand`, `hover:bg-brand-hover`, cream ground). No new colours.

**Logic**
- `lib/currency-from-place.ts`: `inferCurrency(place): Currency`. INR when the text names India, an Indian state or UT, or a major city including old and new names (Bangalore/Bengaluru, Bombay/Mumbai, Gurgaon/Gurugram, Madras/Chennai, Calcutta/Kolkata, Pune, Hyderabad, Noida…). Matches whole words, case-insensitive. Everything else is USD. It's pure, with tests, including that "Indiana" and "Indianapolis" stay USD.
- `createSale` server action: validates name and pickup, checks currency against `CURRENCIES` and the date as ISO, inserts the listing (empty `sellerContacts`, no items), then redirects to `/sell/[id]` or `/manage/[id]#import`.
- `insertWithUniqueSlug` moves from `seller/add/actions.ts` to `lib/listing-insert.ts` so both paths share it.

**`/sell/[id]` in this slice:** a stub seller home. It shows the sale name, pickup and currency, "Bookmark this, it's how you get back", a "Camera comes next" placeholder, and "Manage claims & items →" to `/manage/[id]`. It 404s for unknown IDs. Slice 4 replaces the placeholder with the camera loop, and slice 8 builds the real home.

**Known gap:** the sale exists at `/r/[slug]` from the moment it's created, as the flow intends ("the live link exists from step 1"), so an unshared sale shows an empty feed. Abandoned empty sales will pile up in the DB. That's fine for now, and I'll note it for a cleanup script later.

**Verify:** `pnpm test`, `pnpm build`, then in the browser at 375px: a DC sale (USD), an "Indiranagar, Bengaluru" sale (₹ chip appears), Change overriding it, "Pick a date", the CSV path landing on `/manage` import, the `/seller/add` redirect, and an unknown `/sell/[id]` 404. Delete the test listings from `app/` afterwards and check the row count.

### 4. Camera loop + photos
- Use `<input type="file" accept="image/*" capture="environment">`, which opens the phone camera with no native app. Reuse `lib/image.ts` (downscale), `uploadPhotos()` and `signPhotoUploads()`.
- Each photo creates a `draft=true` item right away. "Another angle" adds to the same item, up to 8 photos (`MAX_PHOTOS`).
- "Tell us about it" is a textarea; the phone keyboard's mic handles dictation. Skip moves on.

**Detailed plan**
- **Hide drafts from buyers first.** Feed, item page, QR sheet and the claim gate all add `draft = false`, so a draft item 404s and can't be claimed. Drafts are also saved `unlisted`, so any surface that only checks `unlisted` still hides them.
- **The camera is the phone's own.** `capture="environment"` opens the native camera app; there's no in-page viewfinder like the canvas mock. The canvas "Camera" screen therefore becomes a launch point on `/sell/[id]`: a big "Take a photo" button plus "Choose from gallery".
- **Photo → draft.** The photo is downscaled and uploaded straight to Storage (existing signed-upload path). A `createDraftItem` action then inserts the item: `draft = true`, `unlisted = true`, a placeholder name "Item N", photos, and the sale's `pickupFrom` as `availableFrom`. The preview shows immediately from the local file while that happens.
- **"Tell us about it" screen** (canvas `2b`): the cover photo, a strip with the item's photos (remove ✕ while there are 2+), **Camera** and **Gallery** tiles for more angles (up to 8, "2 of 8"), the note textarea and the sparkle line. **Next item** saves the note and opens the camera again in the same tap; **Skip** does the same without a note; **Done** returns to the seller home. "Delete this item" discards a bad shot (drafts only).
- **Seller home** shows "N drafts" as a thumbnail strip above the camera buttons, plus the Manage link. The full draft queue is slice 6.
- **`/manage` until slice 6.** Drafts show up there as unlisted rows. Listing one (per row, bulk, or via save) clears `draft` too, so a seller who shoots photos now still has a way to publish.
- **Verify:** 375px headless run with real JPEGs (create, add angle, remove, note, next, delete), check that a draft's buyer URL 404s and isn't in the feed or QR sheet, listing it in `/manage` publishes it. Delete test listings afterwards.

### 5. AI drafting
- A server action, `draftItem(itemId)`, sends the photo(s) + `seller_note` to Claude and gets back structured JSON: name, category (from `CATEGORIES`), plain description, brand from a logo, brand guess, `ambiguous` + candidates, and original price / bought date if the note mentions them.
- **Prompt guardrails from the test:** describe only what's visible or said; never invent selling points; brand only from a logo or the note (a guess goes to `ai_draft`, not to the item); no condition; no price.
- Fired from the client after each upload so the seller keeps shooting. Drafts show "Drafting…" until done. Set `maxDuration = 60`, plus a retry for the Supabase `ETIMEDOUT` blip.

### 6. Draft queue
- One card per draft. Name, category and description are editable. A brand guess shows as a "Looks like X?" chip.
- **Required to publish:** photo, name, condition (the seller picks) and price.
- Price buttons are per category and per currency, from `lib/price-steps.ts`, with Free first and Other last. Placeholder steps:
  - USD furniture: Free / $25 / $50 / $100 / $200
  - USD small items: Free / $5 / $10 / $20 / $50
  - INR furniture: Free / ₹500 / ₹1,000 / ₹2,000 / ₹5,000
  - INR small items: Free / ₹100 / ₹200 / ₹500 / ₹1,000
- "Which one are you selling?" appears only when `ambiguous` is set. Picking several makes one draft per pick, sharing the photos, and each gets re-drafted.
- Publish sets `draft=false`. "Publish all ready" does it in bulk.

### 7. First publish: contact + payment
- Shown before the first item goes live. It asks for phone or email (saved to `sellerContacts`), plus an optional Venmo (USD) or UPI ID (INR) as the sale-wide default.
- Show the seller-home link with "Bookmark this, it's how you get back." Proper recovery is a separate job.

### 8. Seller home (`/sell/[id]`)
- Link with Copy and Share (`navigator.share`), the QR sheet (existing `/r/[slug]/share`), a "N drafts to finish" prompt, the live list and "Add items". It links to `/manage/[id]` for claims and everything else.

### 9. Gallery batch + grouping (last; can follow the first phone test)
- Multi-select from the gallery. One AI call over the thumbnails returns groups plus "not sure" flags. Show the grouping screen (split, move, own item), then create the drafts.

## How I'll test it
- On my phone, run one **US sale** and one **India sale** end to end. Shoot about 5 items each, including one busy photo and one item with no sentence.
- Claim an item as a buyer from a second browser. Check that Venmo and UPI open the right apps (Android and iPhone).
- Check `$` and `₹` formatting on the feed, the item page and the QR sheet.
- `pnpm test` and `pnpm build` must pass. **Delete the throwaway listings afterwards**, running from `app/` and checking the row count.

## Risks and open questions
- **AI cost and latency per item** on the cheaper model. Slice 0 measures it.
- **iPhone camera input and `upi://` behaviour** need real-device checks.
- **The price steps are guesses,** especially in ₹. Watch what sellers actually pick.
- **The manage link is the listing's own ID,** and mine has been in this public repo's history. Add a separate, rotatable `manage_token` per sale (and rotate mine), alongside the "getting back to a sale" job.
- **Docs to update when this ships:** CLAUDE.md's currency rule, and principle #2 ("SMS is the medium"), since India would be WhatsApp when messaging comes.
