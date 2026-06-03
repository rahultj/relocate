# Prompt: HTML implementation plan for the Relocation Items Marketplace

Paste the block below into a fresh Claude Code session (or any capable LLM). It should return a single `index.html` file you can open in a browser.

```
I'm building a website to help me offload household items when I move back
to India. I need an implementation plan for the MVP — and I want the plan
itself delivered as an HTML file I can open in a browser, not a wall of
Markdown.

## Design system

There is a `design.html` file in this same folder. Read it first. It is my
living design system — colors, typography, spacing, base components, and
their states. Treat it as the source of truth for visual language. Every
mockup you produce must inherit from it: same palette, same type scale,
same component shapes. If this app needs a component that doesn't yet
exist in `design.html` (e.g. item card with availability date and claim
status, OTP input, waitlist position indicator, QR share button), design
it as a natural extension of what's already there so it feels native to
the system rather than bolted on.

## Product summary

A simple website where I list each item with a photo, a brief description,
and the date it becomes available. Visitors browse and either claim or
join a waitlist for any item. The moment a slot opens — someone drops out,
or the item is free earlier than expected — the next person on the
waitlist gets notified.

The defining constraint: every decision defaults to the path of least
resistance for the *buyer*. No accounts, no app to install, no need to
return to the site after claiming. SMS is the medium — receipts,
reminders, waitlist promotions, and two-way chat with the seller all
happen over SMS via a proxy number so real numbers stay private.

The one deliberate exception is a single OTP at claim time to prove the
phone number is real. That kills ghost claims and keeps the waitlist
trustworthy. The seller absorbs complexity so the buyer doesn't have to.

## Core flows

- **Seller**: bulk-add items (photo, short description, available-from
  date, condition). Share a listing link or per-item links; QR codes for
  both are auto-generated and printable. Dashboard tracks each item as
  listed → interested → confirmed → picked up.
- **Buyer**: browse a clean list sorted by availability date. Enter phone
  number to claim or waitlist; verify with one OTP. Receive an SMS
  receipt, a 48h reminder, and any seller messages — all over SMS,
  proxied so neither side sees the other's real number. Reply CANCEL to
  any platform SMS, or use the cancel link in the receipt (a token tied
  to that phone number + item), to drop out — which auto-promotes the
  next person on the waitlist.
- **Trust** lives in who you share the link with; the verified phone
  number is identity. No password — passwords forward without friction
  and don't tie identity to a real person the way OTP does.

## Out of scope for MVP (note them, don't design them)

- AI-assisted pricing (v2): suggest a price from comparable eBay /
  Facebook Marketplace listings.
- Passive social proof: "12 people viewed this", waitlist depth shown.
- Estate-sale / professional-seller mode and Facebook Marketplace
  syndication.
- WhatsApp channel as an opt-in alternative to SMS (post-MVP — Meta
  approval friction).

## What I want back

Generate a single self-contained `index.html` file. Inline CSS only, no
external dependencies, no build step — I should be able to double-click
the file and read the plan.

Include whatever helps me make decisions and hand this to an engineer:

- Visual mockups of the key screens, rendered in HTML/CSS (no image
  assets — use styled divs and inline SVG): item listing, item detail
  with claim CTA, OTP entry, seller bulk-add, seller dashboard, QR share,
  and the shape of an SMS conversation.
- A short rationale next to each screen explaining why it's designed
  this way given the buyer-first principle.
- A sequence diagram for the claim → OTP → SMS receipt → cancellation →
  waitlist promotion path.
- A data model sketch: tables, fields, relationships.
- A build sequence with milestones — explicitly mark what ships in MVP
  vs. v2.
- A risks / open-questions section calling out SMS vs. WhatsApp, OTP
  drop-off potential, and disputes / no-shows.

Style: clean, modern, dense but scannable — closer to a Linear or Vercel
internal design doc than a marketing site or slide deck. The palette,
type, and component vocabulary all come from `design.html` — don't
introduce new colors or fonts unless you're proposing a deliberate
extension to the system, and call that out explicitly if you do.

Constraints set, goal stated — design the ideal plan for this problem.
Leave room to surprise me where you can.
```
