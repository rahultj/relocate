# mustgo

I'm moving from Washington, D.C. back to India, and I built mustgo to sell my household things before I go. It's a simple marketplace: I list my items, share a link or QR code, and people browse and claim what they want. Friends use it for their own move-out sales too (Mayowa runs one), so every listing stands on its own.

## Principles, in order

1. **Buyer-first, always.** If a feature adds friction for buyers to make my life easier, it needs a real reason.
2. **SMS is the medium.** Receipts, reminders, chat and cancellations happen over SMS through a proxy number. No app, no email, no login.
3. **OTP is the identity.** One verification at claim time. That verified phone is the buyer's identity for the life of the listing.

#2 and #3 aren't built yet. Claims today are a "soft claim": buyers give a name plus an email or phone, I trust it, and nothing gets sent. I chose that on purpose to launch faster. The data model is still OTP-ready, so real verification can slot in later without a rewrite.

## Spec

- **`index.html`** is the original plan: mockups, data model, milestones and rationale. Treat it as read-only. If it needs to change, ask me first.
- **`design_system.html`** is the Weave visual system and the source of truth for colors, type and components.
- Preview: https://rahultj.github.io/relocate/

## How the app works

**Buyers**
- **Feed `/r/[slug]`:** the listing title and my intro on top, then an "Available" band followed by a "Claimed & Sold" band. Each band is grouped into category sections. Filters: category, status (All / Available / Claimed / Sold, showing only statuses that exist) and "Free only". Files: `r/[slug]/{page,listing-feed}.tsx`.
- **Item `/r/[slug]/[itemId]`:** photo carousel, price and details, and the claim button. Buyers can claim, release their claim, or join and leave the waitlist on a claimed item. After claiming they see a pay button: Venmo on USD sales, UPI on INR sales (the item's own handle/ID, else the sale-wide default). Free items show none. Sold items show a final "Sold" panel. Unlisted items say "No longer available" instead of a 404, so printed QR codes never break. Files: `r/[slug]/[itemId]/{page,claim-button,actions}.tsx`, `components/photo-carousel.tsx`.
- Buyers are identified by their contact, remembered in localStorage. There are no accounts.

**Sellers**
- **`/sell`:** start a sale (name, pickup place, currency: $ or ₹). `/seller/add` 308-redirects here.
- **`/sell/[id]`:** seller home, the seller's one link. Shared frame (`sell/[id]/seller-shell.tsx`, data from `lib/seller-data.ts`): the public link (Copy, QR sheet, Share) and three tabs.
  - **Items** (`sell/[id]/{page,seller-items}.tsx`): a "Drafts to finish" banner, every published item with a status line (Available / Hidden / Claimed by X · N waiting / Sold) and All/Available/Hidden chips, Select mode to hide or show in bulk with undo. Tapping an item opens the **item sheet** (`item-sheet.tsx`, `lib/item-sheet.ts`): photos with an Edit mode (remove with undo, make cover), the claim panel (mark sold, release with a confirm, undo sold, waitlist), price, condition, name/description/category and details, Paid to, Shown to buyers. The open item is `?item=<id>`. "Add items" opens a sheet: the camera loop, Type one in, or the import and photo tools. A sale with nothing published shows the camera buttons inline.
  - **Claims** (`sell/[id]/claims/`, `lib/seller-claims.ts`): claimed and sold totals, open claims by person or by item with Sold / Release, waitlists, sold items with Undo.
  - **Sale** (`sell/[id]/sale/`): pickup, dates, currency, name and intro, contacts, the sale-wide Venmo/UPI, rename the public link, QR sheet, CSV export/template, and links to the tools.
  - **Tools:** `/sell/[id]/import` (CSV or pasted rows) and `/sell/[id]/photos` (match photos by filename), logic in `lib/sell-import.ts`.
- **Camera loop** (on the seller home): each photo becomes a hidden draft item, with extra angles and a "Tell us about it" note. When the seller moves on, `POST /sell/[id]/draft` has Claude (`claude-haiku-5-5`) draft the name, category and description. Files: `sell/[id]/{camera-loop,actions}.tsx`, `sell/[id]/draft/route.ts`.
- **`/sell/[id]/drafts`:** draft queue. One card per draft: check the AI's fields, a "Looks like X?" brand chip, pick condition and price, publish. Files: `sell/[id]/drafts/{page,draft-queue}.tsx`.
- Drafts (`draft = true`) 404 for buyers and stay out of the feed and QR sheet.
- **`/manage/[id]`:** the old seller editor, kept as a fallback while the `/sell` tabs are tested. `REDIRECT_TO_SELL` in `manage/[id]/page.tsx` turns on a 308 to `/sell/[id]` (off for now). Everything it does: The listing's UUID is the secret link, and there are no accounts. Everything autosaves. Features:
  - Listed/Unlisted per item. Imported items start out Unlisted.
  - One "Import & tools" menu: import or paste a CSV, match photos by filename, add an item by hand, download CSV, CSV template, show/hide all. `?tool=csv|photos|add` opens a tool directly.
  - Claims overview grouped by person, or by item. Unlisted and sold items drop out of it.
  - Release a claim, mark sold or undo, and see the waitlist with contacts.
  - Multiple photos per item (cover first), plus a bulk matcher that pairs photos to items by filename.
  - CSV import and re-import, a CSV template, and a CSV export of the current items.
  - Seller contacts (shown to buyers), per-item Venmo, category, and a renamable public link (old slugs 308-redirect).
- **`/r/[slug]/share`:** printable sheet with QR codes for the listing and each item.
- **`/`:** landing page for people thinking about listing their own stuff.

**Key libs (`app/src/lib/`)**
- `csv.ts`: import mapping, template, export.
- `category.ts`: the canonical `CATEGORIES` list (Plants sits just before Other), synonyms, and `suggestCategory` from the item name.
- `item-save.ts`: field parsing. A $0 price becomes Free.
- `money.ts`: per-currency display (USD/INR) of minor-unit prices.
- `venmo.ts`: always builds `https://venmo.com/u/<user>` links. `upi.ts` builds `upi://pay` links; `payment.ts` picks which one a buyer sees.
- `ai-draft.ts` (prompt, schema, no-clobber `applyDraft`) and `ai-draft-run.ts` (server-only API call).
- `draft-queue.ts` (readiness, brand-in-name) and `price-steps.ts` (the queue's price buttons).
- `photos.ts`: `photo_urls` is the source of truth; `photo_url` mirrors the cover.
- `storage.ts`: server-only, signed uploads.
- `with-listing.ts`: capability check for `/manage` actions.

## What's next

- **Waitlist auto-promotion.** When a claim is released, promote the #1 waiter instead of reopening the item. Plan: `WAITLIST_PROMOTION_PLAN.md`.
- **Seller v1** (`SELLER_V1_BUILD_PLAN.md`): slices 0–8 are live. Phase 2 (item sheet, Claims and Sale tabs, tools in `/sell`) is built on `claude/loving-dijkstra-oyu7di`, waiting on a phone test. After it passes: flip `REDIRECT_TO_SELL`, then delete the earnings branch (the Claims tab's totals replace it) and, later, `/manage`'s editor code.
- **Getting back to your sale.** Once a seller leaves `/sell/[id]`, nothing leads back to it: the buyer page has no seller link and the browser doesn't remember the sale. Idea: remember owned sales in localStorage, show a "This is your sale · Manage →" bar on the buyer page for that browser only, and list "Your sales" on `/sell`. Cross-device recovery stays with the `manage_token` job.
- Later, maybe: a clearer "tap to claim" cue in the feed, email the seller on claim or waitlist, real OTP/SMS, a custom domain.

## Stack

Next.js 16 (App Router, TypeScript, Turbopack) · Supabase (Postgres + Storage, free tier) · Drizzle ORM · Tailwind v4 · shadcn/ui · Vitest · Vercel.

Everything runs from `app/`:

```
pnpm dev            — dev server, http://localhost:3000
pnpm build          — production build
pnpm test           — Vitest (pure helpers in lib/)
pnpm lint           — eslint
pnpm db:generate    — generate migration SQL from schema changes
pnpm db:studio      — Drizzle Studio
```

Copy `app/.env.example` to `app/.env.local` and fill in the Supabase credentials. The `DATABASE_URL` password contains an `@`, so it's encoded as `%40`. The runtime uses the transaction pooler (port 6543).

## Gotchas

- **`pnpm db:push` is broken** (a drizzle-kit introspection bug). Generate the SQL with `db:generate`, then apply the `ALTER` as a raw `postgres` script (see `app/scripts/add-*.mjs`).
- **Dev and prod share one Supabase project.** A schema change or a data script hits the live site.
- **Run one-off scripts from `app/`** with `--env-file=.env.local`. Anywhere else, `postgres` won't resolve and the script fails silently. Always check a delete's row count.
- **Clean up test data.** Delete any throwaway listing when you're done.
- **Supabase `read ETIMEDOUT`** is a free-tier blip. A one-off 500 that works on retry isn't a bug.
- **Vercel env vars:** `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` and `ANTHROPIC_API_KEY` (AI drafting; Production + Preview) are all required. `NEXT_PUBLIC_*` values bake in at build time, so redeploy after changing them. A misnamed `NEXT_PUBLIC_SUPABASE_URL` once silently broke photo uploads.
- **Vercel's ~4.5MB request limit.** Photos never go through a server action: `/manage` and `/sell` upload browser → Storage directly.
- **CSV re-import matches by name.** Rename an item in the CSV and it comes in as a new row. Blank cells never overwrite, and re-import never deletes.
- **Testing uploads headless:** the file input is `hidden`. Un-hide it with JS before uploading a real JPEG.

## Design conventions

- **Palette** lives in `globals.css` as CSS variables, mirrored as Tailwind tokens: crimson `--brand-primary #C85A5A`, cream `--bg-main #FAF8F5`, `--bg-card #F7F5F1`, `--text-primary #2A2A2A`, forest `--forest #2D6A4F` (available), ochre `--ochre #C9A227` (insight / waitlist), indigo `--indigo #1E3A5F`. The full palette is in `design_system.html`. Don't add colors without proposing them first.
- **Type:** Cormorant Garamond for editorial moments (headlines, prices); DM Sans for UI. Both load via `next/font/google` in `layout.tsx`.
- **Theming:** `globals.css` has the Weave palette plus shadcn semantic tokens (`--background`, `--primary`, …) mapped onto it. Keep that mapping and don't reset it to shadcn defaults.
- **The mockups in `index.html` are the design contract.** Flag it before redesigning anything.

## Data conventions

- Each sale has a `currency` (USD or INR). Prices are stored as `price_cents`, an int in that currency's minor units (cents or paise), and shown as `$X` or `₹X`. Zero shows as "Free".
- Dates use US format on USD sales ("Jun 14, 2026"), day-first on INR sales ("14 Jun 2026"), and ISO 8601 in the DB.
- DB columns are snake_case and TS is camelCase. Drizzle bridges the two.
- Slugs are 4-character base32 (listing slugs retry on collision). Sellers can rename the listing slug; item slugs stay opaque.
- Phone hash and encrypted E.164 columns exist for the future OTP flow. Soft claim doesn't use them.

## How I want to work

- **Plan first, one feature at a time.** Check the approach with me, build it, verify it in the browser, then commit.
- **Ask before guessing.** If the spec doesn't cover something, raise it instead of inventing an answer.
- **Test at real mobile widths** (375px+).
- **Commit atomically**, with messages in the style of the existing log.
- **No subagents** unless I ask. A single focused session is cheaper, so save them for adversarial review.

## Repo + deploy

- Live: https://mustgo.vercel.app (the stable prod alias). Not `relocate.vercel.app`, which is an unrelated project.
- Repo: https://github.com/rahultj/relocate. Pushing to `main` auto-deploys to Vercel.
- My listing: `/r/swahul`. Its `/manage` link is the secret for editing it, so never put the listing ID in this repo (it's public).
