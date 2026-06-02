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

- **Next.js 15** (App Router, TypeScript, React Server Components)
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

(Populated once `app/` is scaffolded — leave this section empty until then so it stays honest.)

```
# cd app && pnpm dev          — local dev server
# cd app && pnpm db:push      — push Drizzle schema to Supabase
# cd app && pnpm db:studio    — open Drizzle Studio
# cd app && pnpm build        — production build
```
