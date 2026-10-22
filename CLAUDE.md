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
- **Item `/r/[slug]/[itemId]`:** photo carousel, price and details, and the claim button. Buyers can claim, release their claim, or join and leave the waitlist on a claimed item. After claiming they see a "Pay @handle on Venmo" link if the item has one. Sold items show a final "Sold" panel. Unlisted items say "No longer available" instead of a 404, so printed QR codes never break. Files: `r/[slug]/[itemId]/{page,claim-button,actions}.tsx`, `components/photo-carousel.tsx`.
- Buyers are identified by their contact, remembered in localStorage. There are no accounts.

**Sellers**
- **`/seller/add`:** first publish. Drop in a CSV, check the column mapping, fix rows, publish.
- **`/manage/[id]`:** everything after that. The listing's UUID is the secret link, and there are no accounts. Everything autosaves. Features:
  - Listed/Unlisted per item, plus bulk toggles. Imported items start out Unlisted.
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
- `venmo.ts`: always builds `https://venmo.com/u/<user>` links.
- `photos.ts`: `photo_urls` is the source of truth; `photo_url` mirrors the cover.
- `storage.ts`: server-only, signed uploads.
- `with-listing.ts`: capability check for `/manage` actions.

## What's next

- **Waitlist auto-promotion.** When a claim is released, promote the #1 waiter instead of reopening the item. Plan: `WAITLIST_PROMOTION_PLAN.md`.
- **Unmerged branch** `claude/earnings-sold-claimed-items-649hts` shows total earned on `/manage`. Review it, then merge or drop it.
- **Delete the test listing `/r/3dtn`** ("Live manage test"). Scoped delete, run from `app/`, confirm the row count is 1.
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
- **Vercel env vars:** `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SECRET_KEY` are all required. `NEXT_PUBLIC_*` values bake in at build time, so redeploy after changing them. A misnamed `NEXT_PUBLIC_SUPABASE_URL` once silently broke photo uploads.
- **Vercel's ~4.5MB request limit.** `/manage` uploads photos browser → Storage directly. `/seller/add` still sends photos as base64 through the publish action, so attaching lots of photos before the first publish can hit the limit.
- **CSV re-import matches by name.** Rename an item in the CSV and it comes in as a new row. Blank cells never overwrite, and re-import never deletes.
- **Testing uploads headless:** the file input is `hidden`. Un-hide it with JS before uploading a real JPEG.

## Design conventions

- **Palette** lives in `globals.css` as CSS variables, mirrored as Tailwind tokens: crimson `--brand-primary #C85A5A`, cream `--bg-main #FAF8F5`, `--bg-card #F7F5F1`, `--text-primary #2A2A2A`, forest `--forest #2D6A4F` (available), ochre `--ochre #C9A227` (insight / waitlist), indigo `--indigo #1E3A5F`. The full palette is in `design_system.html`. Don't add colors without proposing them first.
- **Type:** Cormorant Garamond for editorial moments (headlines, prices); DM Sans for UI. Both load via `next/font/google` in `layout.tsx`.
- **Theming:** `globals.css` has the Weave palette plus shadcn semantic tokens (`--background`, `--primary`, …) mapped onto it. Keep that mapping and don't reset it to shadcn defaults.
- **The mockups in `index.html` are the design contract.** Flag it before redesigning anything.

## Data conventions

- Prices are stored as `price_cents` (int, USD) and shown as `$X`. Zero shows as "Free".
- Dates use US format in the UI ("Jun 14, 2026") and ISO 8601 in the DB.
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
- My listing: `/r/swahul` (id `262da553-11ec-4414-986a-01c9f86dcdc6`).
