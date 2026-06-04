# Soft claim — plan (M2-lite, no OTP/SMS)

A lightweight claim flow to replace full M2 (OTP + SMS) for launch. The buyer's
**contact becomes their identity**, captured on trust (no verification sent),
remembered in the browser. Designed so real OTP verification can slot in later
without a rewrite.

**This is a deliberate spec deviation.** `index.html` makes "OTP is identity,
phone = identity for the listing's life" a core principle (#3) and "SMS is the
medium" (#2). Soft claim trades verification for simplicity at launch. The data
model is kept OTP-ready so the principle can be enacted later, not thrown away.

## Decisions (locked with Rahul, 2026-06-04)

1. **Unverified capture.** Claim = name + (email *or* phone). Item marked claimed
   instantly. Nothing sent to the buyer. No OTP, no SMS, no email-to-buyer.
2. **Contact = identity, browser-remembered.** First claim stores the buyer's
   name+contact in `localStorage`; server creates/finds one `buyer` row keyed by
   normalized contact. Same contact (even on another device) → same buyer.
3. **Multi-claim = one-tap after first.** Subsequent claims on the same device
   are pre-filled / one-tap "Claim as <name>", with a "not you?" link to switch.
   No multi-select/basket UI.
4. **Seller side = surfaced on /manage.** Claimed items show who claimed, their
   contact, and when, in the existing manage view. Seller reaches out manually.
   No seller email notification yet.
5. **Other buyers see "Claimed."** Item stays visible, shows a Claimed state,
   Claim button disabled. First-come-first-served, no double-claims. Not hidden,
   no waitlist.

## Data model

Reuse the empty M2 tables; adapt `buyers` from phone-only to contact-generic.

**`buyers` (schema change — via raw SQL; `db:push` is broken, see CLAUDE.md):**
- `phone_hash`, `phone_e164` → make **nullable** (keep for the future OTP path).
- add `name text` (claim captures it; no column today).
- add `contact text` — normalized email or phone, stored **plain text** (seller must
  read it to reach the buyer; `/manage` is already gated by the secret listing UUID).
- add `contact_type text` — `'email'|'phone'`, plain text (no new pg enum — keeps the
  fragile raw-SQL migration to ALTERs only; derive/validate in code).
- add `unique(contact)` — the dedupe key. `verified_at` stays null for soft.

**`claims`:** fits as-is. One row per (item, buyer); `unique(item_id, buyer_id)`
already prevents a buyer double-claiming the same item. Soft claim sets
`status = 'confirmed'` (accepted immediately — no pending-OTP state).
`otp_verified_at` stays null. `cancel_token` unused for now.

**`items.status`:** flips `listed` → `claimed` when claimed (this is exactly
what the enum's `claimed` value was reserved for). The buyer feed already filters
on `unlisted`; add a Claimed treatment keyed on `status = 'claimed'`.

```
CLAIM FLOW
 buyer taps Claim ─▶ form (name + email|phone)   [prefilled if localStorage has them]
        │
        ▼
 claimItem(listingId, itemId, name, contact)
        │  normalize contact → upsert buyer by contact (dedupe)
        │  insert claim (item, buyer, status=confirmed)   [unique(item,buyer)]
        │  set items.status = 'claimed'                   [guard: only if still listed]
        ▼
 item shows "Claimed" to everyone; seller sees buyer+contact on /manage
```

## Architecture (locked by /plan-eng-review 2026-06-04)

**`claimItem(listingId, itemId, name, contact)`** — standalone server action (NOT
`withListing`; it has richer outcomes). Returns a discriminated result:
`{ ok: true } | { ok: false; reason: 'taken' | 'invalid' | 'notfound' }`.

```
claimItem(listingId, itemId, name, contact):
  1. norm = normalizeContact(contact)            # pure; null → reason:'invalid'
     name.trim() required                          # empty → reason:'invalid'
  2. look up listing by id (slug for revalidate)   # missing → reason:'notfound'
  3. db.transaction:
       a. const won = UPDATE items SET status='claimed'
            WHERE id=? AND listing_id=? AND status='listed' AND unlisted=false
            RETURNING id                            # ← atomic race gate
          if won.length === 0 → throw Taken         # already claimed/unavailable
       b. const [buyer] = INSERT INTO buyers (name, contact, contact_type)
            ON CONFLICT (contact) DO UPDATE SET name=excluded.name
            RETURNING id                            # dedupe by contact
       c. INSERT INTO claims (item_id, buyer_id, status='confirmed')
            ON CONFLICT (item_id, buyer_id) DO NOTHING
  4. revalidateListing(slug)  → returns { ok:true }
  catch Taken → { ok:false, reason:'taken' }        # buyer: "just claimed by someone else"
```

The whole thing is one transaction: if the buyer/claim insert fails, the
`status='claimed'` flip rolls back too (no item stuck claimed with no claim row).

**`normalizeContact(raw)` — pure, unit-tested.** `{ contact, type:'email'|'phone' } | null`:
- trim; if it has `@` and matches a simple email shape → `{ lowercased, 'email' }`
- else strip to digits/`+`; if ≥ 7 digits → `{ digits, 'phone' }`
- else `null` (invalid).

**`itemStatusEnum` already has `claimed`** — no enum change. Feed already renders the
claimed chip off `status !== 'listed'` (`listing-feed.tsx:100`). The item **detail**
page must add the same branch (today it only checks `unlisted`) and select `status`.

## Buyer flow

- Item detail page (`/r/[slug]/[itemId]`): the currently-disabled "Claims open
  soon" button becomes an active **Claim** button.
- Tap → inline form or sheet: Name, and one field for Email or Phone (single
  input + a tiny email/phone toggle, or auto-detect). Submit.
- On success: button → "Claimed by you", localStorage stores `{name, contact}`.
- Returning buyer (localStorage present): Claim button reads "Claim as <name>"
  → one tap, no form; "not you?" clears it.
- Feed (`/r/[slug]`): claimed items get a Claimed chip; their Claim affordance
  is disabled.

## UI states (locked by /plan-design-review 2026-06-04)

Mockup: `app/claim-mock.png` (sent in chat). Classifier APP UI, Weave palette.
The claim UI lives **inline in the existing item-detail layout** (no new card
chrome) — it replaces the disabled "Claims open soon" block at `page.tsx:165-178`.

| State | What the buyer sees |
|-------|---------------------|
| **Default** | Crimson "Claim this item" button + mono sub-line "Free to claim · no account needed". |
| **Form** (inline expand) | "Your name" + one "Email or phone" field (auto-detects type) + privacy line "Shared only with the seller, to arrange pickup. Nothing posted publicly." + "Claim it". |
| **Claiming** | Button busy-state: spinner + "Claiming…", disabled. |
| **Claimed by you (success)** | Forest-tinted block: ✓ "You claimed this" + "The seller will reach out at **<contact>** to set up pickup. Keep an eye out." This is the trust moment — confirms it worked AND what happens next. |
| **Returning buyer** | One-tap "Claim as <name>" + sub-line "<contact> · not you?" (clears localStorage identity). |
| **Claimed by someone else** | Disabled "Claimed" button + muted "Someone grabbed this one first." |
| **Lost the race** (claimed while form open) | On submit → disabled "Claimed" + crimson line "Someone just claimed this a moment ago. Sorry! Browse the rest →". |

**Locked details:**
- **One auto-detecting contact field** (not an email/phone toggle): `@` present →
  email, else phone. Less chrome.
- **Name required**; empty name or unparseable contact → inline `reason:'invalid'`.
- Success copy says **"the seller"** (no seller-name field exists; keeps it generic).
- **Persistence:** localStorage remembers `{name, contact}` AND the set of claimed
  itemIds, so revisiting a claimed item shows the success state, not the form.
- A buyer **cannot self-cancel** (no buyer→seller channel by design) — the seller
  un-claims manually. Noted, accepted for v1.

**Responsive / a11y:**
- Mobile-first (buyers on phones). Contact + name inputs `font-size: 16px` to avoid
  iOS auto-zoom; ≥44px touch targets; `inputmode` hint on the contact field.
- Success/error region `aria-live="polite"` so screen readers announce the outcome.
- Claim button is a real `<button>`; disabled states use `disabled` + muted styling
  (mirrors the existing disabled-button pattern).

## Seller flow (/manage)

- Each claimed row shows: Claimed · <name> · <contact> · <when>.
- Optionally a small "Claims" summary at top (N claimed). Reuses the editor;
  no new screen.
- Seller can mark an item back to listed (un-claim) if a claim falls through —
  reuses the listed/unlisted mental model.

## Edge cases / eng questions (for /plan-eng-review)

- **Race / double-claim:** two buyers claim the same item at once. Guard with an
  atomic `UPDATE items SET status='claimed' WHERE id=? AND status='listed'` —
  the loser gets "just claimed by someone else." `unique(item_id, buyer_id)`
  covers a single buyer double-submitting.
- **Contact normalization:** lowercase/trim email; strip formatting on phone
  (don't need strict E.164 for soft, but normalize enough to dedupe).
- **PII:** soft contacts are stored raw (not hashed) — acceptable for capture,
  but note it. Don't reuse the OTP hashing path for soft rows.
- **Abuse:** unverified claims can be spammed with junk contacts. Low risk at
  launch scale; consider a light per-IP/per-session rate limit later.
- **Schema change** must be applied as raw SQL (drizzle `db:push` is broken).

## Tests (ship with the code)

```
CODE PATH COVERAGE
==================
[+] lib/contact.ts  normalizeContact()        ← pure, Vitest
    ├── [PLAN] valid email (mixed case → lowercased, type=email)
    ├── [PLAN] valid phone (formatting stripped, type=phone)
    ├── [PLAN] junk / too-short → null
    └── [PLAN] dedupe: "A@x.com" and "a@x.com " normalize equal
[+] claimItem()  server action               ← no harness in M1
    ├── [PLAN→manual] happy path: listed → claimed + buyer + claim rows
    ├── [PLAN→manual] RACE: 2 concurrent claims, one wins / other gets 'taken'
    ├── [PLAN→manual] re-claim same item by same contact → no-op (ON CONFLICT)
    ├── [PLAN→manual] same contact claims 2 items → 1 buyer row, 2 claims
    └── [PLAN] invalid contact / empty name → reason:'invalid' (pure guard testable)
[+] ClaimButton (client)                      ← manual / browser
    ├── [PLAN→manual] first claim writes localStorage, button → "You claimed this"
    ├── [PLAN→manual] returning buyer: one-tap "Claim as <name>", "not you?" clears
    └── [PLAN→manual] claimed-by-someone-else item → disabled, "Claimed"
```

- **Pure + Vitest now:** `normalizeContact` (the dedupe key correctness — a normalization
  bug = duplicate buyers or unreachable contacts). Ships with code.
- **No server-action harness in M1** (same as the manage work): `claimItem`'s race +
  dedupe are verified **manually** — two concurrent claims (the atomic `UPDATE … WHERE
  status='listed'` is the guarantee; confirm the loser gets `taken` and no item ends up
  claimed without a claim row). Building a harness is out of scope.

## NOT in scope (deferred)

- OTP verification, SMS, Twilio, proxy chat — real M2.
- Email (to buyer OR seller) — no sender wired.
- Waitlist / "notify if it frees up" — M3.
- Multi-select / basket claiming — browser-remember covers the friction.
- Cancel-by-buyer, cancel tokens — seller un-claims manually for now.

## OTP upgrade path (why this isn't throwaway)

The `buyer` row keyed by contact is exactly what OTP later verifies — flip
`verified_at`, populate `phone_hash`/`phone_e164`, and the same claim rows stand.
Soft claim is the unverified prefix of the real M2 flow, not a parallel system.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 2 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 6/10 → 9/10, 7 decisions |

**UNRESOLVED:** 0
**VERDICT:** ENG + DESIGN CLEARED — ready to implement.

## Approved Mockups

| Screen | Mockup | Direction |
|--------|--------|-----------|
| Claim states (item detail) | `~/.gstack/projects/rahultj-relocate/designs/soft-claim-20260604/claim-states.png` | 7 states, Weave palette; success state carries the trust ("the seller will reach out at <contact>"). |
