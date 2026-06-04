# /manage/[id] editor — UX refresh plan

**Goal:** make the manage editor intuitive. One coherent save model, clearer
information architecture, honest Listed/Unlisted control. Approved direction
from `/plan-design-review` (2026-06-04).

Mockup: `~/.gstack/projects/rahultj-relocate/designs/manage-editor-20260604/mockup.html`
(rendered PNG sent in chat). Classifier: APP UI.

## The core problem

Two save models on one screen. Photos auto-save on attach; text edits stage
until a bottom **Save changes** button. Worst of all, the **Listed/Unlisted
pill looks like an action button** — clicking it dims the row and flips the
label, giving full visual confirmation of a change that *hasn't saved* (it's a
local `onPatch`; persistence only happens in `onSave`). Taking an item down,
the most consequential action here, lies to the seller. That's a trust bug, not
polish.

## Decisions (locked)

1. **Single save model: auto-save everything.** Kill the bottom Save button.
   Every field (title, city, pickup, name, condition, price, date, description)
   persists on blur/debounce. The Listed/Unlisted switch and bulk toggles
   persist on click. Photos already work this way.
2. **Save status:** one quiet top-right pill aligned with the title —
   `All changes saved` (forest) ⇄ `Saving…` (ochre). Replaces the save bar.
3. **Save failure = optimistic + auto-retry + loud fail.** Edit applies
   instantly, saves in background, silently retries 1–2× on transient error
   (the Supabase pooler `ETIMEDOUT` class). If it still fails: top pill turns
   crimson `Couldn't save — retry`, AND the affected row gets a crimson edge +
   inline retry. The unsaved value stays on screen — nothing is lost.
4. **Listed/Unlisted becomes a real switch** (forest track on / muted off),
   saves on click. What you see is what's live.
5. **Bulk List all / Unlist all: undo toast.** Acts instantly, shows
   `Unlisted 73 items · Undo` for ~8s. No confirm dialog in the common path.
6. **Listing details collapse** to a one-line summary (`City · Neighborhood ·
   Pickup range`) with an `Edit details ▾` disclosure. Expanded form is the
   exception, not the default — the item list gets the top of the screen.
7. **Item-count line + bulk toggles become a paired header** directly above the
   rows (Gestalt proximity), so the bulk action visibly belongs to the list.

## Pass ratings (before → after this plan)

| Pass | Dimension | Before | After |
|------|-----------|--------|-------|
| 1 | Information Architecture | 5 | 9 |
| 2 | Interaction states | 3 | 9 |
| 3 | User journey / safety | 4 | 9 |
| 4 | AI slop risk | 9 | 9 |
| 5 | Design system alignment | 8 | 9 |
| 6 | Responsive & a11y | 4 | 9 |
| **Overall** | | **5** | **9** |

## Architecture (locked by /plan-eng-review 2026-06-04)

**Save model: per-item patch actions** (mirror the existing `setItemPhoto`).
Reject debouncing the whole-listing `updateListing` (resends all 73 rows +
keeps the reload hack). New server actions in `manage/[id]/actions.ts`:

```
patchItem(listingId, itemId, fields)         → idempotent; safe to retry
createItem(listingId, fields)                → returns {itemId, slug}; NOT idempotent
patchListingDetails(listingId, fields)       → title/city/nbhd/pickup
setItemsListed(listingId, itemIds[], listed) → bulk; ONE update ... where id in (...)
```

`updateListing` is **kept, but only** for the CSV import-merge commit (bulk,
gated behind the "Merge" button). `setItemPhoto` stays as-is.

**DRY — extract `withListing(listingId, fn)`** helper: loads the listing (or
returns not-found), runs `fn`, then `revalidatePath` of `/r/[slug]`, `/share`,
`/`. Use it in all four new actions AND refactor `setItemPhoto` onto it.

**Shared field mapper.** The `priceText → {isFree, priceCents}` logic (currently
inlined in `onSave`) becomes one function used by both `createItem` and
`patchItem`. No duplication.

```
DATA FLOW (per edit)
 row field edit ──debounce 600ms / blur──▶ save-queue (coalesce per row)
                                              │
        existing row (has itemId) ───────────┼──▶ patchItem ──┐
        new row, on FIRST BLUR (name set) ───┴──▶ createItem ─┤
                                                  └ folds {id,slug} back into row state (NO reload)
                                              │
        toggle / bulk ───────────────────────┴──▶ setItemsListed
                                              ▼
                            status pill: idle→saving→saved→error
```

**New-row creation: on first blur, name required.** A new row is created the
moment focus leaves it (single discrete event — no concurrency race to guard),
only if it has a non-empty name (matches `updateListing` dropping blank rows).
Pre-blur edits stay local and are captured by the create. After create the row
has an `itemId` and all further edits are idempotent patches.

**`status` vs `unlisted` (correctness).** Schema has both. Buyer surfaces filter
on `unlisted`; `status` is M2 claim-state. New inserts hardcode
`status:"listed"`. Auto-save toggles MUST write only `unlisted` and never touch
`status`, or the two fields diverge. `setItemsListed` writes `unlisted` only.

**Save status store.** `idle | saving | saved | error` global + per-row error
flag. Drives the top pill and row edges.

**Optimistic + retry.** Apply locally first; queue the write; silently retry
transient failures 1–2× (patches are idempotent, so retry is safe; `createItem`
is NOT retried blindly — it's a discrete blur event, guard with a per-row
"creating" flag so a second blur can't re-create). On exhaustion: crimson pill +
row edge, value retained.

- **`Switch` component.** `role="switch"`, `aria-checked`, ≥44px hit area,
  forest/muted from existing tokens. Replaces the pill button.
- **Undo toast.** Bulk actions; "Undo" restores the prior `listed` set and
  re-saves via `setItemsListed`.
- **Collapsed details disclosure.** Summary line + expandable form; remember
  open/closed within the session.
- **Responsive.** Row regrids to the existing flex-stack under `sm:`; collapsed
  details and the save pill stack cleanly; switch stays thumb-reachable.
- **Remove** the sticky bottom save bar; keep "View public listing ↗", relocated
  near the title or list header.

## Tests (ship with the code)

Pure, unit-testable in the existing `lib/*` sanity style:
- **field mapper:** `"free"`/`""`→`isFree`, `"$40"`/`"40"`→`4000`, loose-date passthrough.
- **save-queue reducer:** rapid edits to one row coalesce to latest; failure sets
  row error flag + retains value.
- **bulk undo (regression-class):** undo restores the exact prior listed-set.

No server-action test harness exists in M1 — `createItem`-on-blur and
optimistic-retry are verified **manually**, not by building a harness (out of
scope). Failure modes to manually confirm: pooler `ETIMEDOUT` mid-edit →
retry → crimson fail with value retained (no silent loss); double-blur on a new
row → exactly one item created.

## NOT in scope (deferred, with rationale)

- **Multi-tab / multi-device conflict resolution.** Single-seller tool; last
  write wins is acceptable. Revisit only if the seller routinely edits from two
  places.
- **Field-level version history / full undo stack.** Undo is bulk-toggle-only
  for now. Per-field undo is a bigger feature, not needed to fix the trust bug.
- **Offline editing / write queue persistence across reload.** Retry covers
  transient blips; true offline is out of scope.

## What already exists (reuse)

- Weave palette + `inputCls`, `Field`, `EditRow`, `trustMeta` in
  `listing-editor.tsx`.
- `updateListing` server action + `setItemPhoto` / `signPhotoUploads` (the
  photo auto-save path is the proven model to mirror).
- Pure helpers: `lib/csv`, `lib/format`, `lib/photo-upload`.

## TODOS (design debt surfaced)

- a11y audit of the new switch + toast with a screen reader before ship.
- Confirm the optimistic-retry copy ("Couldn't save — retry") reads calm, not
  alarming, in the crimson pill.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 3 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 5/10 → 9/10, 7 decisions |

**UNRESOLVED:** 0
**VERDICT:** DESIGN + ENG CLEARED — ready to implement.
