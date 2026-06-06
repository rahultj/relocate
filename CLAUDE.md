# mustgo — Relocation Marketplace

A single-seller relocation marketplace for offloading household items before a move. Seller is in Washington, D.C. moving to India. Named **mustgo** (chosen 2026-06-04, replacing the "Saudade" working placeholder).

**Three principles, in order:**
1. **Buyer-first, always.** Any feature that adds friction for the buyer to make the seller's life easier needs explicit justification.
2. **SMS is the medium.** Receipts, reminders, chat, cancellations all happen over SMS via a proxy number. No app, no email, no login.
3. **OTP is the identity.** One verification at claim time. Verified phone is the buyer's identity for the lifetime of the listing.

(M1 doesn't enact #2 or #3 yet — they shape later milestones. They still inform M1 decisions like "claim button is visible but disabled, not hidden.")

## Spec

- **`index.html`** — the implementation plan. Read it for milestone definitions, mockups, data model, and rationale. **Treat it as read-only during build.** If a spec change is needed, flag it and ask before editing.
- **`design_system.html`** — the Weave visual system. Colors, type scale, components. Source of truth for visual language.
- **Live spec preview:** https://rahultj.github.io/relocate/

## Currently building

**M1: Display + bulk-add** (section 12 in `index.html`, milestone 1).

**The question M1 answers:** Does the brand and the visual hold up when a friend sees it?

### Progress

Subgoals (one at a time, stop after each — see Working agreements):
- [x] **Scaffold** — Next 16 + Tailwind v4 + Drizzle + Supabase client + shadcn/ui under `app/`. Weave palette wired in `globals.css`; fonts via `next/font`. Dev server boots clean (`curl /` returns 200, title + fonts + classes correct).
- [x] **Schema** — all 6 tables (section 11 contract) in `src/db/schema.ts`; M1 writes `listings`/`items`, M2 tables land ready+empty. Migration `0000` generated, `tsc` clean. Lazy `db` client in `src/db/index.ts`. **Pushed to Supabase 2026-06-02** — all 6 tables + 5 enums + indexes/FKs live in the free project (ref `asqfjnwchqfimcythbla`).
- [x] **CSV-first bulk-add** at `/seller/add` (section 07). Drop/paste CSV → transparent overridable column mapping → editable Ready/Draft/Skip rows → publish (transactional, slug collision-retry). Pure logic in `lib/csv.ts`+`lib/format.ts`+`lib/slug.ts`, unit-sanity-tested. Added a "Listing details" mini-form (title/city/pickup) since M1 has no separate listing-creation step.
- [x] **Photo upload** (wired 2026-06-03). Attach per-row / bulk-drop → downscaled in-browser (`createImageBitmap`→canvas, max 1280px JPEG q0.82) → sent as base64 in the publish action → uploaded to Supabase Storage bucket `item-photos` (public) via the **secret key** (new-style `sb_secret_...`, env `SUPABASE_SECRET_KEY`; server-only `lib/storage.ts`) → public URL stored as `photoUrl`. `serverActions.bodySizeLimit` bumped to 10mb. Verified end-to-end locally. **Vercel still needs `SUPABASE_SECRET_KEY` added** for prod uploads to work.
- [x] **Public listing page** at `/r/[slug]` (section 03). Server page fetches listing + items (sorted by `available_from`, nulls last) → `<ListingFeed>` client component with All/Available/Free-now filter pills. Item rows link to `/r/[slug]/[itemId]` (detail page next). Photo or letter-initial thumb, forest "Available" chip, Cormorant price with `$` adornment / "Free". Unknown slug → 404. Built + verified via a live publish (`/r/dxb2`), pending Rahul review (2026-06-03).
- [x] **Item detail page** at `/r/[slug]/[itemId]` (section 04). Server page loads listing+item by slug pair (404 if either missing). Square hero (photo or letter-initial), Cormorant title, insight-tinted trust-meta block (Price/Bought/Originally/Available/Condition/Pickup — rows dropped when no data), Cormorant description. Claim button **visible but disabled** with quiet "Claims open soon" note (buyer-first: disabled, not hidden). Verified at `/r/dxb2/aybz`. Pending Rahul review (2026-06-03).
- [x] **QR + printable letter sheet** at `/r/[slug]/share` (section 09). Listing QR (→ feed) + per-item QR (→ detail) on one print-clean letter sheet; `window.print()` toolbar (screen-only, `print:hidden`), copy-link. QR via `qrcode` lib → crisp SVG server-side (`lib/qr.ts`). Absolute URLs derived from request `headers()`. Post-publish success state links to it ("Get QR & print sheet"). Verified at `/r/dxb2/share`. Pending Rahul review (2026-06-03).

**All five M1 subgoals built**, plus post-M1 enhancements (live on Vercel). See "Post-M1" + "Resume here" below.

### Post-M1 (shipped + deployed, 2026-06-03/04)

- **Deployed to Vercel** — live at `https://mustgo.vercel.app` (stable prod alias; per-deploy hash URLs change each push). NOT `relocate.vercel.app` (unrelated project). Auto-deploys on push to `main`. Env vars (Production): `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` — all four required; `NEXT_PUBLIC_*` bake in at build time (push to apply). Deployment Protection is OFF (public).
- **Minimal home index** (`src/app/page.tsx`) — lists every published listing + link to `/seller/add`.
- **`/manage/[id]`** — append/edit a listing without changing its `/r/[slug]` URL. Access = the listing's UUID as a secret capability (shown on publish as a bookmark link). CSV re-import **matches existing items by normalized name and updates in place** (blank cells don't overwrite; new rows append). Add items by hand. Edit listing details. Files: `manage/[id]/page.tsx`, `listing-editor.tsx`, `actions.ts` (`updateListing`).
- **Soft unlist** — `items.unlisted` column (added via direct `ALTER TABLE`; `db:push` is broken by a drizzle-kit introspection bug, apply migrations as raw SQL). Unlisted = hidden from feed/QR/home count, but detail page resolves "No longer available" (printed QR never 404s). Listed/Unlisted toggle + List all/Unlist all bulk buttons. **Imported items default to Unlisted** (stage, then list when ready).
- **CSV dates** — `parseLooseDate` (`lib/format.ts`) now handles `now`/`today`, month+day with year inference (`July 30`), and US M/D/Y, on top of the original month+year/ISO.
- **Bulk photo matcher** — on `/manage`, "Bulk add photos" drops a whole folder; matches each file to an item by filename (normalized, tolerant of `-1`/`_console` suffixes), review/fix in a dropdown list, then attach.
- **Photos upload browser→Storage on attach** (not through Save). `lib/storage.ts` `signUploads()` → signed URLs; `app/seller/photo-actions.ts` (`signPhotoUploads`, `setItemPhoto`); `lib/photo-upload.ts` `uploadPhoto()` + `lib/supabase-browser.ts`. Existing items **auto-save** on upload; new rows carry the URL until Save. This fixed bulk-photo Saves hanging on Vercel's ~4.5MB function-body limit. (NOTE: `/seller/add` first-publish still sends photos as base64 through the publish action — same latent limit if many photos are attached before first publish; not yet migrated to the signed-upload path.)

**Rahul's real listing:** "Rahul and Swati's Ghar Waapsi", id `262da553-11ec-4414-986a-01c9f86dcdc6`, ~73 items, all listed/public, mostly priced, few photos (he's adding them via the bulk matcher).

### Resume here (last worked 2026-06-06) — all shipped + live; pick next goal

Everything below is **merged to `main`, deployed to `https://mustgo.vercel.app`, and prod-verified.** Nothing is mid-flight. Four things shipped on 2026-06-04 (each: planned → eng+design review → built → tested → merged → deployed → smoke-checked):

1. **`/manage` auto-save** (PR #1) — single save model, no Save button. Real Listed/Unlisted switch that actually persists (was the headline bug: it dimmed the row but never saved). Per-item actions (`patchItem`/`createItem`/`patchListingDetails`/`setItemsListed`) via a `withListing()` helper; `useListingSave` debounce+optimistic-retry; new rows create on first blur; top-right save-status pill; bulk undo toast; collapsed listing-details. Plan: `MANAGE_UI_PLAN.md`.
2. **Rebrand → "mustgo"** (PR #2) — replaced the "Saudade" placeholder everywhere. URL is now `https://mustgo.vercel.app` (added that as a Vercel production domain; the project also has `relocate-blond.vercel.app`).
3. **Soft claim** (PR #3) — M2-lite, **no OTP/SMS** (deliberate spec deviation, OTP-ready). Buyer claims with name + email-or-phone (contact = identity, browser-remembered, deduped); item flips `status=claimed`; seller sees claimant on `/manage` (mailto/tel). Plan: `SOFT_CLAIM_PLAN.md`. Real OTP/SMS M2 deferred.
4. **Readable listing URLs** (PR #4) — sellers rename `/r/<slug>` on `/manage` ("Public link" editor); old slugs 308-redirect via `listings.previous_slugs`. Item slugs stay opaque.

**Shipped 2026-06-05** (direct to `main`, commits `2325a55`→`813e601`; planned with the user → built → tested → deployed → live design-review):

- **Buyer-feed design polish** (`2325a55`) — (a) photoless item-detail hero was a full `aspect-square` (~576px of empty cream) burying the title/price/Claim below the fold; now a compact `h-40` band, full square only when a real photo exists. (b) Normalized the "Free" price treatment to serif (forest, muted when claimed) across feed + detail so the price column reads as one system. Dropped the redundant "Free now" filter pill.
- **Category browsing** (`fe8fa0c`/`4ca3f4b`/`dda651f`/`813e601`) — items now have a **category** (`items.category` text col, applied via raw SQL `scripts/add-category-column.mjs`). Fixed canonical set in `lib/category.ts` (Furniture/Kitchen/Electronics/Lighting/Bedding/Decor/Other) with synonym normalization + **keyword auto-suggest from the item name** (`suggestCategory`). CSV import maps a `category` column (alias `category|type|group|room`) and auto-suggests blanks. Buyer feed `/r/[slug]` now **groups items into sticky category sections** (canonical order, Other last, empty sections hide, filters re-group live); falls back to a flat list when nothing is categorized. `/manage` has a **per-item category dropdown** (auto-saves) and re-import threads category through (blank doesn't overwrite). Rahul's 73 live items were backfilled via `scripts/backfill-categories.ts` (dry-run by default; `--apply` to write) — all 73 auto-categorized, zero unguessed. A few guesses are debatable (Steel dustbin→Kitchen, Laundry basket→Decor, Shoe rack→Furniture) — fix on `/manage` if desired.

**Shipped 2026-06-06** (direct to `main`, commits `1bca0b7`→`7dae6de`; each: planned/clarified with the user → built → in-browser verified (gstack `browse`) → committed → pushed → prod-smoke-checked → throwaway data cleaned):

- **Unclaim** (`1bca0b7`) — both sides. Buyer: the claim success box gains "Release this claim" (confirm step) → `unclaimItem`, authorized by the localStorage contact (a confirmed claim must exist for it) → item back to `listed`, drops the local claimed mark. Seller: `/manage` claim badge gains "Release claim" (confirm) → `releaseClaim` (capability-checked via `withListing`). Both: confirmed claim → `cancelled`, item `status` → `listed`, one txn; buyer row + `unlisted` flag untouched. Also fixed `claimItem` to **revive a cancelled row on re-claim** (`onConflictDoUpdate`) so re-claimers show on `/manage`. Files: `r/[slug]/[itemId]/actions.ts`, `claim-button.tsx`, `manage/[id]/actions.ts`, `listing-editor.tsx`.
- **Photo crop fix** (`9f9170b`) — item-detail hero forced every photo into `aspect-square object-cover`, center-cropping round/portrait items. Now `object-contain` at natural aspect, capped `max-h-[28rem]`, small cream letterbox instead of a crop. Photoless items keep the `h-40` letter band. Feed thumbs stay square (list preview). File: `r/[slug]/[itemId]/page.tsx`.
- **Dropdown filters** (`9be88d1`, refined `ebb90e7`, `2d9d939`) — buyer feed `/r/[slug]` replaced the All/Available/Free **pills** with two native `<select>` dropdowns (open as the OS picker on mobile) + a "Free only" toggle. **Category** dropdown lists present categories; "All" keeps the sticky category-section grouping, picking one collapses to a flat list. **Availability** dropdown lists the listing's **real `available_from` dates** ("Available now" + "From Jul 30", exact-date cohorts) — not synthetic relative buckets. Per-option `· N` counts were tried then **removed** (noise). File: `listing-feed.tsx`.
- **Move story in header + editable intro** (`67d67a5`) — added nullable `listings.intro` (raw-SQL `ALTER`, `db:push` still broken). Buyer header now leads with the **listing title as the big serif headline** (was a small mono eyebrow), drops the auto "N things, going home", shows `intro` as a paragraph (a "mustgo" kicker sits on top). `/manage` Listing-details gains an "Intro · your move story" textarea (autosaves via `patchListingDetails`). Seeded a draft intro on the real listing — Rahul to reword on `/manage`. Files: `r/[slug]/page.tsx`, `manage/[id]/{actions,page}.tsx`, `listing-editor.tsx`, `schema.ts`.
- **CSV re-import timeout fix** (`77ea4c9`) — re-import rewrote **all** items as sequential UPDATE/INSERT in one txn (~13.6s on 73 items → overran Vercel's function timeout → whole import rolled back, so "add a few" silently no-op'd). Now the client sends **only new/changed rows** (unchanged left untouched; `updateListing` never deletes); new rows insert in **one batched statement**. Single-add dropped 13.6s → ~0.85s. Added `maxDuration = 60` on `/manage`. Files: `listing-editor.tsx` (`applyImport`), `manage/[id]/{actions,page}.tsx`.
- **CSV description separator** (`64f0957`) — two columns mapped to Description (Company/model + Remarks) joined with `"\n"`, which HTML collapses to a space → run-on line. Now join with `" | "` (`lib/csv.ts` `MERGE_SEP`). **Migrated the 11 existing affected rows** (`\n` → ` | `) via authorized one-off SQL. +2 tests.
- **Waitlist** (`7dae6de`) — buyers who miss out can **Join the waitlist** on a claimed item (the old "Claimed" dead-end). No schema change (claims already have `waitlist` status + `position`). Buyer: same one-tap/form flow → "You're #N on the waitlist" (localStorage `mustgo_waitlist` remembers position; "Leave the waitlist" mirrors unclaim; freed-up mid-flow → `reason:"available"` nudges to claim). Server: `joinWaitlist` (position = max+1 in-txn, revives a left row, guards against waitlisting an item you hold) + `leaveWaitlist` (contact-authorized → `cancelled`); `WaitlistResult` type. Seller: `/manage` shows "Waiting (N): name · contact" (mailto/tel) under the claim badge, ordered by position. **Manual outreach — no auto-promotion/notify** (deferred to real M2/SMS, decided with the user). `releaseClaim`/`unclaim` unchanged; waitlist rows persist. Plan: `~/.claude/plans/now-i-m-considering-adding-mighty-moth.md`. Files: `r/[slug]/[itemId]/{actions,claim-button}.tsx`, `manage/[id]/{page,listing-editor}.tsx`.

**Repo now has Vitest** (`pnpm test`, 58 tests): pure helpers in `lib/` (item-save, contact, slug, category, **csv description join**) + backfilled csv/format.

**Open threads / possible next goals (Rahul to pick):**
- Rahul's real listing is **`/r/swahul`** (renamed from `bt8x`, which 308-redirects). id `262da553-11ec-4414-986a-01c9f86dcdc6`. **~86 items** now (re-imported 2026-06-06, up from 73).
- **Intro copy:** a placeholder move-story `intro` is live on the real listing — Rahul to reword on `/manage` (autosaves, no redeploy).
- **Waitlist is manual** (`7dae6de`): seller sees waiters + contacts on `/manage` and reaches out by hand. **→ Next planned goal: waitlist auto-promotion.** Releasing a claim should promote the #1 waiter (item stays claimed, never re-opens to the feed); seller still notifies manually; plus a small `myItemStatus` lookup so the promoted buyer sees it on return. Full executable plan: **`WAITLIST_PROMOTION_PLAN.md`** (drafted 2026-06-06, not started). No schema change for the core.
- **`/seller/add` doesn't expose category in its column-mapping UI yet** (only `/manage` does). The add flow still auto-suggests + persists category silently; surfacing it there is a small follow-on if wanted.
- A **real custom domain** is still optional/deferred (mustgo.vercel.app is fine for now).
- Natural follow-ons to soft claim: **seller email-notify on claim/waitlist** (small), or **real OTP/SMS M2** (big).
- **Leftover test listing in prod:** `/r/3dtn` "Live manage test" (pre-existing, not mine) — Rahul to confirm before deleting.

**Gotcha learned:** one-off DB scripts must run from `app/` (not `/tmp`) or `postgres` won't resolve and they fail silently — always confirm a delete's row count. See memory `throwaway-cleanup-gotcha`.

To resume: `cd app && pnpm dev`. **Always wipe throwaway test listings when done** (scoped `delete from listings where title='…'`; run the script from `app/`). A dev server may already be running on :3000 from a prior session.

**Known transient:** Supabase free-tier pooler occasionally throws `read ETIMEDOUT` (one-off 500, succeeds on retry) — not a code bug.

**Env is set up** (`app/.env.local` filled, gitignored). Just `cd app && pnpm dev` to resume.
- `DATABASE_URL` password contained an `@` → URL-encoded as `%40`. Runtime uses transaction pooler **6543**; `db:push` needs session pooler **5432** (the `db:push` invocation auto-swaps the port, and `drizzle.config.ts` now loads `.env.local`).
- **`pnpm db:push` is currently broken** — drizzle-kit 0.31.10 throws on introspection (`Cannot read properties of undefined (reading 'replace')` on a CHECK constraint). Apply schema changes as **raw SQL** instead (generate with `db:generate` for the SQL, then run the `ALTER`/`CREATE` directly via a `postgres` script with `--env-file=.env.local`). Dev and prod share the one Supabase project, so a schema change hits both.

**`/seller/add` bulk-add visual — resolved (`4a4c8e3`):** `DraftRow` rebuilt on the spec's CSS grid (`index.html:853`) — thumb | name+condition | price | date | state | trash, first line vertically centered, meta+description on a second line; mobile keeps a flex stack. Thumbs 64px. Delete is a `Trash2` icon (crimson hover via `--crimson`/`--destructive`), top-right on mobile / inline grid column on desktop. `$` adornment on numeric prices (hidden for Free/empty).

Earlier open decision still standing: (a) collapsed "Listing details" form on `/seller/add` vs. separate step. (Photo upload — formerly deferred — is now wired; see subgoal above.)

**Ships in M1:**
- Postgres schema — `listings` and `items` (claim/buyer tables stub empty, ready for M2)
- Public listing page at `/r/[slug]` sorted by `available_from`
- Item detail page at `/r/[slug]/[itemId]` with full meta block (price, Bought, Originally, condition, pickup); claim button visible but disabled with "Claims open soon" label
- Seller bulk-add at `/seller/add` — **CSV-first import** (see section 07). Photo upload per row. State pills (Ready / Draft / Skip)
- QR + printable letter sheet for listing and per-item

**NOT in M1:**
- Claim flow, OTP, SMS, proxy chat — M2
- Seller dashboard, waitlist promotion, cancel — M3
- AI-suggested pricing, multi-claim UI — v2

## Stack

- **Next.js 16** (App Router, TypeScript, React Server Components, Turbopack)
- **Supabase** — Postgres + Storage for photo uploads. Free tier.
- **Drizzle ORM** — migrations + type-safe queries
- **Tailwind CSS** — theme tokens ported from `design_system.html`
- **shadcn/ui** — base components, themed with Weave palette
- **Vercel** — hosting; deploys on push to `main`

## File structure

```
.
├── index.html               # spec (do not edit during M1 build)
├── design_system.html       # visual spec
├── CLAUDE.md                # this file
└── app/                     # Next.js app
    ├── src/
    │   ├── app/             # routes (App Router)
    │   ├── components/      # UI components
    │   ├── lib/             # db client, utils
    │   └── db/              # drizzle schema + migrations
    ├── public/
    └── package.json
```

## Design conventions (port from design_system.html)

**Palette** — CSS variables in `globals.css`, mirrored as Tailwind theme tokens:
- `--brand-primary: #C85A5A` (crimson)
- `--bg-main: #FAF8F5` (cream)
- `--bg-card: #F7F5F1`
- `--text-primary: #2A2A2A`
- `--forest: #2D6A4F` (available state)
- `--ochre: #C9A227` (insight / waitlist)
- `--indigo: #1E3A5F`

Full palette in `design_system.html`. Don't introduce new colors without proposing them as deliberate extensions.

**Type:**
- Cormorant Garamond — editorial moments (headlines, pull quotes, prices)
- DM Sans — UI chrome (buttons, labels, metadata)
- Loaded from Google Fonts (preconnect both stylesheet hosts)

**Match the mockups in `index.html`.** They are the design contract — don't redesign without flagging it.

## Data conventions

- **Currency: USD.** All prices stored as `price_cents` (int). Display as `$X` with no decimals for whole dollars.
- **Dates: US format in UI** ("Jun 14, 2026"). ISO 8601 in DB.
- **DB columns: snake_case.** TS: camelCase. Drizzle bridges.
- **Slugs:** 4-character base32 for listings (collision-retry on insert); 4-character within-listing for items.
- **Phone numbers:** stored as both salted hash (lookup) and encrypted E.164. M1 doesn't write to these tables — schema lands ready for M2.

## Working agreements

- **One subgoal at a time.** Schema → CSV import → listing page → detail page → QR. Stop after each so I can review before you move on.
- **Commit atomically.** One commit per subgoal with a descriptive message in the style of the existing repo log.
- **Don't add features not in M1.** If something tempts you, leave a `// TODO(M2):` or `// TODO(M3):` comment instead.
- **Test responsive on real mobile breakpoints** (375px+). The mockup phone frame in `index.html` is 340px wide intentionally; real devices are wider so spacing that's tight in the doc has more room in the real app.
- **Ask before guessing.** If the spec doesn't cover something, surface it — don't invent.

## Subagents

Don't spawn subagents for M1. The work is small and sequential — a single focused session is more token-efficient than orchestrating subagents. Save them for adversarial code review at the end of a milestone if needed.

## Repo + deploy

- **Live app (Vercel):** https://mustgo.vercel.app (stable production alias; per-deploy hash URLs change every push). NOT `relocate.vercel.app` — that's an unrelated project in the global namespace.
- **Vercel env vars (Production):** `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` must all be set. `NEXT_PUBLIC_*` bake in at **build time** — after changing them, push/redeploy. Gotcha that cost a long debug (2026-06-03): photo upload silently no-op'd because `NEXT_PUBLIC_SUPABASE_URL` was misnamed `EXT_PUBLIC_...` in Vercel; `lib/storage.ts` is the only server code that reads it, so nothing else broke. Photo upload verified working in prod once fixed.
- **Repo:** https://github.com/rahultj/relocate
- **Plan preview (Pages):** https://rahultj.github.io/relocate/
- **App deploy:** Vercel — set up when the Next.js scaffold lands

## Common commands

All commands run from inside `app/` (e.g. `cd app && pnpm dev`).

```
pnpm dev            — local dev server (Turbopack, http://localhost:3000)
pnpm build          — production build
pnpm lint           — eslint
pnpm db:generate    — generate a new Drizzle migration from schema changes
pnpm db:push        — push schema directly to Supabase (dev convenience)
pnpm db:studio      — open Drizzle Studio against DATABASE_URL
```

Copy `app/.env.example` to `app/.env.local` and fill in Supabase credentials before running `db:*` commands.

## Theming notes

`src/app/globals.css` carries two layered token sets:
- **Weave palette** (`--brand-primary`, `--bg-main`, `--forest`, `--ochre`, `--text-primary`, etc.) — the brand source of truth, used by hand-built UI.
- **shadcn semantic tokens** (`--background`, `--primary`, `--border`, `--ring`, etc.) — mapped onto Weave so shadcn primitives render on-brand. Don't override these with the shadcn defaults; the mapping is intentional.

Tailwind v4's `@theme inline` block exposes both layers as utility classes (`bg-bg-main`, `text-brand`, `border-border-weave`, plus standard `bg-primary`, `text-foreground`, etc.).
