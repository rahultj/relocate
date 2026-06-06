# Plan: Waitlist auto-promotion + buyer status lookup

Status: **PLANNED, not started** (drafted 2026-06-06 with Rahul). Pick up later.

## Context / why

Today releasing a claim (seller `releaseClaim`, or a buyer's `unclaimItem`)
sends the item **back to the open feed** and leaves waitlist rows untouched — so
the people who waited get no priority, which defeats the point of a waitlist.

Decision (with Rahul): **auto-promote the next person in line** when a claim is
released. The item stays claimed (never re-opens to the public if someone's
waiting). Notification stays **manual** — consistent with how the app already
works (no claim of any kind auto-notifies; the seller reaches out via the
mailto/tel links on `/manage`). After a promotion the seller decides, by hand,
to either **inform** the new claimant or **release again** (which cascades to the
next waiter, or to the feed if the line is empty).

Plus: a small **"what's my status?" lookup** on the buyer item page so a promoted
person actually sees they were promoted when they return (see below) — without it
their browser's stale localStorage would still say "waitlist #N".

## Locked decisions
- Auto-promote on **both** paths: seller `releaseClaim` **and** buyer `unclaimItem`.
- Promote strictly **#1 by position** (FIFO).
- Notification is **manual** by the seller (no SMS/email send — that's still M2).
- **Include** the buyer status-lookup (it's what makes promotion visible/real).

## Still-open micro-choice
- **"Promoted — reach out" tag on `/manage`** (recommended): a promoted person
  doesn't know they got it (unlike someone who self-claimed), so a tag reminds
  the seller to message them. Needs a `claims.promoted_at` column (raw-SQL ALTER)
  set on promotion. Optional — core feature works without it. Decide at build time.

## No schema change required for the core
`claims` already has `status` (`waitlist`/`confirmed`/`cancelled`) and `position`.
Only the optional tag needs `claims.promoted_at`.

## Design

### 1. Shared promote helper — new `src/lib/claims.ts`
`promoteNextWaiter(tx, itemId): Promise<boolean>` — runs inside a caller's
transaction:
- Select the `waitlist` claim for `itemId` with the **lowest `position`**.
- If none → return `false` (caller relists the item).
- Else: set that claim `status = "confirmed"`, `claimedAt = now` (and
  `promoted_at = now` if the tag is built); **decrement** the `position` of the
  remaining `waitlist` rows by 1 so the line stays 1,2,3…; return `true`.

### 2. Wire it into both release paths
- `unclaimItem` (`src/app/r/[slug]/[itemId]/actions.ts`): after cancelling the
  holder's claim, call `promoteNextWaiter`. If it promoted → leave item
  `status = "claimed"`. If not → item → `"listed"` (current behavior).
- `releaseClaim` (`src/app/manage/[id]/actions.ts`): same — cancel the confirmed
  claim, then `promoteNextWaiter`; relist only if no one was waiting.
- Both already run in a `db.transaction`; promotion joins that same txn (atomic).

### 3. Buyer status lookup — new action + claim-button wiring
- New action `myItemStatus(itemId, contact)` in the item-page `actions.ts`:
  look up `buyers` by normalized `contact`, then their active claim on `itemId`.
  Return `{ status: "holder" } | { status: "waitlist"; position } | { status: "none" }`.
- `claim-button.tsx` mount effect: when `alreadyClaimed` and a buyer contact is
  remembered in localStorage, call `myItemStatus`:
  - `holder` → show the "You're claiming this" success state (it was promoted).
    Move the item from `mustgo_waitlist` into `mustgo_claims` so later loads are
    instant + offline-correct.
  - `waitlist N` → show "on the waitlist #N" (this also fixes the **stale
    position** problem — positions now come from the server).
  - `none` → "Claimed" (someone else); clear any stale local waitlist entry.
  - **Fallback**: if no remembered contact or the call fails, use today's
    localStorage-only logic (offline-safe; no regression).
- **Residual limit (document, don't fix now):** the lookup only works on the
  browser where they joined (localStorage holds their contact). A brand-new
  device still shows generic "Claimed" — only real accounts/OTP (M2) close that.

### 4. Seller `/manage`
- Existing claimant + waitlist + "Release claim" UI already covers the flow:
  after a promotion the new claimant shows up, the waitlist is one shorter, and
  "Release claim" cascades. The claims-overview banner (top of `/manage`)
  surfaces it on the next visit — important for the **buyer-unclaim** path, where
  the seller didn't act and discovers the promotion there.
- Optional tag (see micro-choice): render "promoted — reach out" when
  `promoted_at` is set, and consider relabelling "Release claim" → "Pass to next
  (Jane)" when a waitlist exists, so the seller knows clicking won't re-open it
  to the public.

## Critical files
- `src/lib/claims.ts` — new `promoteNextWaiter`
- `src/app/r/[slug]/[itemId]/actions.ts` — `unclaimItem` promotes; new `myItemStatus`
- `src/app/manage/[id]/actions.ts` — `releaseClaim` promotes
- `src/app/r/[slug]/[itemId]/claim-button.tsx` — status lookup on mount
- (optional tag) `schema.ts` + raw-SQL `claims.promoted_at`; `manage/[id]/page.tsx` + `listing-editor.tsx`

## Edge cases
- Cascade: each release promotes the next; empty line → feed.
- Promoted buyer declines → they unclaim → promotes the *next* waiter (or relists).
- Concurrency: release + promote are one transaction.
- Position decrement keeps the displayed line clean (1,2,3…).
- Promoted buyer's stale local waitlist entry is corrected by the status lookup.

## Verification (in-browser, throwaway listing)
1. A claims; B joins (#1); C joins (#2).
2. Seller releases A → **B becomes the holder, item stays claimed**, C now #1.
   `/manage` shows B as claimant + C waiting.
3. On B's browser (its localStorage has B's contact), reopen the item → shows
   **"You're claiming this"** (promoted), not "#1".
4. Seller releases B → C promoted. Seller releases C (no waiters) → item back in feed.
5. Buyer-unclaim path: redo with A unclaiming instead of seller releasing → B promoted.
6. `myItemStatus` returns holder/waitlist/none correctly for the three buyers.
7. `pnpm test` + `npx tsc --noEmit` + `pnpm lint` green; clean up throwaway data
   from `app/` (scoped delete; confirm row counts — see throwaway-cleanup gotcha).
