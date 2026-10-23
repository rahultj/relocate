# Seller flow (v1)

The photo-first seller flow, as designed. The visual mockups are on the "mustgo seller flow" canvas: https://claude.ai/artifact/MYnpD3ftM88552ZDMfvZCd. Why each decision was made: `SELLER_JTBD.md`. How it gets built: `SELLER_V1_BUILD_PLAN.md`.

## The flow

```
 1. Start a sale ──▶ 2. Camera loop ──────────▶ 3. Draft queue ──▶ First publish ──▶ 4. Seller home
    name, pickup,       photo → one sentence      finish each       contact +          link, QR, drafts,
    available from      → next item               draft             Venmo / UPI        live items
    (currency set           │                        ▲                                      │
     from pickup)           └─ Gallery ─▶ Group ─────┘                                      │
                                         photos                                             │
                                  ▲                                                         │
                                  └────────────────────── "Add items" ◀─────────────────────┘
```

The live link exists from step 1. Items go live one at a time as each draft is finished.

## Screens

1. **Start a sale:** three questions for the whole sale: name, pickup, available from. Currency follows the pickup location ($ or ₹, with a "Change" link). CSV import is a small link at the bottom. No account.
2. **Camera loop:** take a photo, then "Tell us about it" (type, or dictate with the keyboard mic), then the next item. The AI drafts in the background. Several photos per item (cover + strip, up to 8). Skip is allowed.
3. **Gallery batch → grouping:** pick many photos at once. The AI groups photos of the same item and flags groups it isn't sure about ("one lamp or two?"). The seller splits or moves photos, then creates the drafts.
4. **Draft queue:** one card per item showing what the AI drafted (name, category, plain description). A brand guessed from the design shows as a "Looks like X?" chip to confirm. The seller picks **condition** and **price** (quick buttons per category and currency, Free first). "Looks good · publish" publishes one item; "Publish all ready" publishes the rest.
5. **"Which one are you selling?":** only when the AI flags a busy photo. Picking several makes one draft per pick.
6. **First publish:** phone or email for buyers, plus an optional Venmo handle (US) or UPI ID (India) as the sale-wide default.
7. **Seller home:** link, Share, QR sheet, "N drafts to finish", live items, "Add items". Claims and everything else stay on `/manage` for now.

## Rules the design follows

- **Mobile first.** The phone camera is the main input; CSV is a backup.
- **AI output lands as drafts.** Nothing AI-written goes live until the seller has checked it.
- **The AI names, categorizes and describes.** It doesn't guess brand (unless a logo is visible), condition or price.
- **To go live, an item needs:** photo, name, condition and price ("Free" counts).
- **v1 is listing and claims.** No messaging, no price guidance.
