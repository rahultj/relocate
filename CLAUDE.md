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

### Resume here (2026-06-04) — /manage auto-save SHIPPED (PR #1, pending merge)

The `/manage/[id]` editor UX polish is **done** and in review on branch `manage-autosave` ([PR #1](https://github.com/rahultj/relocate/pull/1)). Planned + reviewed (`MANAGE_UI_PLAN.md`: design 5→9, eng clean), implemented, and verified live against the real DB. **Not yet merged to main / deployed.** Next: merge PR → Vercel auto-deploys → dogfood on Rahul's real listing.

What changed: single auto-save model (no Save button). The Listed/Unlisted control was the headline bug — it dimmed the row but never persisted; now it's a real switch that saves on click. Per-item server actions (`patchItem`/`createItem`/`patchListingDetails`/`setItemsListed`) mirror `setItemPhoto`, via a new `withListing()` capability+revalidate helper. `useListingSave` does debounce/coalesce + optimistic retry; new rows create on first blur. Top-right save-status pill, undo toast on bulk list/unlist, collapsed listing-details. `updateListing` retained only for CSV import-merge.

Repo now has **Vitest** (`pnpm test`) — first standing suite (34 tests: pure auto-save logic + backfilled csv/format).

Earlier rough edges (all addressed): dual save model, dense stacked panels, weak Listed/Unlisted affordance.
- Consider a `/plan-design-review` pass on the manage screen.

To resume: `cd app && pnpm dev`; open `/manage/<id>` (publish a throwaway listing on `/seller/add` to get a manage link, or use a test id). **Always wipe throwaway test listings from the DB when done** (scoped `delete from listings where title='…'` is allowed; unbounded wipes get blocked).

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
