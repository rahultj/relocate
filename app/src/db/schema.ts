// Drizzle schema — data-model contract is section 11 in index.html.
//
// M1 writes to `listings` and `items` only. The buyer-side tables
// (`buyers`, `claims`, `otp_codes`, `messages`) land here ready for M2 so
// the schema needs no retrofit — they ship empty in M1.
//
// Conventions (CLAUDE.md):
//   - DB columns snake_case, TS camelCase — Drizzle bridges via `casing` config.
//   - Money as integer cents. Dates as `date` (ISO 8601 in DB, US format in UI).
//   - Phones stored as salted hash (lookup) + encrypted E.164 (routing).

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const itemConditionEnum = pgEnum("item_condition", [
  "new",
  "like_new",
  "good",
  "fair",
  "worn",
]);

export const itemStatusEnum = pgEnum("item_status", [
  "listed",
  "claimed",
  "picked_up",
]);

export const claimStatusEnum = pgEnum("claim_status", [
  "pending",
  "confirmed",
  "waitlist",
  "cancelled",
  "picked_up",
]);

export const messageDirectionEnum = pgEnum("message_direction", ["in", "out"]);

export const messageFromRoleEnum = pgEnum("message_from_role", [
  "buyer",
  "seller",
  "system",
]);

// ---------- listings · one per seller event ----------

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 4-char base32 OR a seller-chosen vanity slug; unique; collision-retry on insert.
  slug: text("slug").notNull().unique(),
  // Slugs this listing used before (after a rename) — resolved to a 301 redirect
  // so old links / printed QR never break.
  previousSlugs: text("previous_slugs").array().notNull().default([]),
  title: text("title").notNull(),
  city: text("city"),
  neighborhood: text("neighborhood"),
  pickupFrom: date("pickup_from"),
  pickupTo: date("pickup_to"),
  // M2: seller identity + proxy routing. Empty in M1.
  sellerPhoneHash: text("seller_phone_hash"),
  proxyNumber: text("proxy_number"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------- items · the things being given away ----------

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    // 4-char, unique within a listing.
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    condition: itemConditionEnum("condition"),
    availableFrom: date("available_from"),
    // null price => free (see isFree).
    priceCents: integer("price_cents"),
    isFree: boolean("is_free").notNull().default(false),
    // Trust-signal fields — sourced from seller CSV at import, rendered as
    // "Bought X · Originally $Y" on the item detail page with no seller intervention.
    boughtDate: date("bought_date"),
    originalPriceCents: integer("original_price_cents"),
    originalBoxIncluded: boolean("original_box_included"),
    photoUrl: text("photo_url"),
    status: itemStatusEnum("status").notNull().default("listed"),
    // Soft-unlist: hidden from the buyer feed but the detail page still resolves
    // ("No longer available") so already-shared/printed per-item QR codes never
    // 404. Reversible. Distinct from `status` (which is the M2 claim lifecycle).
    unlisted: boolean("unlisted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("items_listing_slug_unique").on(t.listingId, t.slug),
    index("items_listing_idx").on(t.listingId),
    index("items_available_from_idx").on(t.availableFrom),
  ],
);

// ---------- buyers · contact identity ----------
// Soft claim (current): keyed by `contact` (email or phone, plain text), captured
// on trust, `verified_at` null. OTP path (future M2): populates phone_hash/
// phone_e164 + verified_at. phone_* are nullable so a soft buyer needs neither.
// `contact` is unique → one buyer per contact (dedupe across items/devices).

export const buyers = pgTable("buyers", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Soft-claim identity.
  name: text("name"),
  contact: text("contact").unique(), // normalized email or phone (plain text)
  contactType: text("contact_type"), // 'email' | 'phone'
  // OTP path (future) — nullable until a buyer verifies.
  phoneHash: text("phone_hash").unique(),
  phoneE164: text("phone_e164"), // encrypted at rest
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  lastOtpAt: timestamp("last_otp_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------- claims · active claims + waitlist, one row each (M2) ----------
// The only mutable record of buyer↔item state. Promotion is a single
// transactional status update.

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    status: claimStatusEnum("status").notNull().default("pending"),
    position: integer("position"), // waitlist order
    cancelToken: text("cancel_token"), // opaque, scoped to (claim_id, phone_hash)
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    otpVerifiedAt: timestamp("otp_verified_at", { withTimezone: true }),
    // Groups bundle claims for batched receipts (multi-claim UI ships v2;
    // column lives nullable from M2 so no retrofit is needed).
    claimSessionId: uuid("claim_session_id"),
  },
  (t) => [
    // A buyer can hold or wait for a given item at most once.
    uniqueIndex("claims_item_buyer_unique").on(t.itemId, t.buyerId),
    index("claims_item_idx").on(t.itemId),
  ],
);

// ---------- messages · canonical SMS log, in + out (M2) ----------

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    fromRole: messageFromRoleEnum("from_role").notNull(),
    body: text("body").notNull(),
    twilioSid: text("twilio_sid").unique(), // idempotency key
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("messages_claim_idx").on(t.claimId)],
);

// ---------- otp_codes · short-lived, single-use (M2) ----------

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneHash: text("phone_hash").notNull(),
    codeHash: text("code_hash").notNull(), // bcrypt
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0), // capped at 5
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("otp_codes_phone_hash_idx").on(t.phoneHash)],
);

// ---------- Inferred types ----------

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Buyer = typeof buyers.$inferSelect;
export type Claim = typeof claims.$inferSelect;
