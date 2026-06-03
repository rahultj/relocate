# Saudade — Relocation Marketplace

A single-seller relocation marketplace for offloading household items before a move. Seller is in Washington, D.C. moving to India. Working name "Saudade" — placeholder, to be replaced before launch.

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
- [x] **CSV-first bulk-add** at `/seller/add` (section 07). Drop/paste CSV → transparent overridable column mapping → editable Ready/Draft/Skip rows → publish (transactional, slug collision-retry). Pure logic in `lib/csv.ts`+`lib/format.ts`+`lib/slug.ts`, unit-sanity-tested. Page renders 200 with no DB. **Photo upload is local-preview only** — `photoUrl` writes null, `TODO(M1)` to wire Supabase Storage (needs `SUPABASE_SERVICE_ROLE_KEY`). Added a "Listing details" mini-form (title/city/pickup) since M1 has no separate listing-creation step.
- [ ] **Public listing page** at `/r/[slug]`.
- [ ] **Item detail page** at `/r/[slug]/[itemId]` — claim button visible-but-disabled.
- [ ] **QR + printable letter sheet** on publish.

**Next up: public listing page `/r/[slug]`** — still paused; Rahul is iterating on the bulk-add visual first (morning of 2026-06-03).

### Resume here (paused 2026-06-02 evening)

DB is now fully wired and the write path works end to end. The pause now is to **polish the `/seller/add` bulk-add visual** before building the listing page — Rahul stopped mid-iteration on row alignment.

**Env is set up** (`app/.env.local` filled, gitignored). Just `cd app && pnpm dev` to resume.
- `DATABASE_URL` password contained an `@` → URL-encoded as `%40`. Runtime uses transaction pooler **6543**; `db:push` needs session pooler **5432** (the `db:push` invocation auto-swaps the port, and `drizzle.config.ts` now loads `.env.local`).
- `pnpm db:push` is non-interactive here — run with `--force` (safe; reviewed). Schema already pushed.

**Work in flight on `/seller/add` (committed `382984d`):**
- Multi-column CSV merge: Company + Model → name, Remarks → description (was a bug — 2nd column matching an already-claimed field silently became "ignore").
- Editable description/remarks line added per draft row; row set to `items-start` so price/date/pill top-align with the name.

**Open / next:**
- Rahul flagged "alignment is all off" → applied `items-start` fix, but he wants to **iterate on the row layout himself in the morning**. The right-side controls may want a baseline nudge rather than pure top-align.
- Then: confirm bulk-add visual is good → build `/r/[slug]` → review → detail page + QR.

Earlier open decisions still standing: (a) collapsed "Listing details" form on `/seller/add` vs. separate step; (b) photo upload deferred (`photoUrl` writes null, needs `SUPABASE_SERVICE_ROLE_KEY`).

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
