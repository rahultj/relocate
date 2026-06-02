CREATE TYPE "public"."claim_status" AS ENUM('pending', 'confirmed', 'waitlist', 'cancelled', 'picked_up');--> statement-breakpoint
CREATE TYPE "public"."item_condition" AS ENUM('new', 'like_new', 'good', 'fair', 'worn');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('listed', 'claimed', 'picked_up');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."message_from_role" AS ENUM('buyer', 'seller', 'system');--> statement-breakpoint
CREATE TABLE "buyers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_hash" text NOT NULL,
	"phone_e164" text NOT NULL,
	"verified_at" timestamp with time zone,
	"last_otp_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyers_phone_hash_unique" UNIQUE("phone_hash")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"status" "claim_status" DEFAULT 'pending' NOT NULL,
	"position" integer,
	"cancel_token" text,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"otp_verified_at" timestamp with time zone,
	"claim_session_id" uuid
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"condition" "item_condition",
	"available_from" date,
	"price_cents" integer,
	"is_free" boolean DEFAULT false NOT NULL,
	"bought_date" date,
	"original_price_cents" integer,
	"original_box_included" boolean,
	"photo_url" text,
	"status" "item_status" DEFAULT 'listed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"city" text,
	"neighborhood" text,
	"pickup_from" date,
	"pickup_to" date,
	"seller_phone_hash" text,
	"proxy_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"from_role" "message_from_role" NOT NULL,
	"body" text NOT NULL,
	"twilio_sid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_twilio_sid_unique" UNIQUE("twilio_sid")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claims_item_buyer_unique" ON "claims" USING btree ("item_id","buyer_id");--> statement-breakpoint
CREATE INDEX "claims_item_idx" ON "claims" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_listing_slug_unique" ON "items" USING btree ("listing_id","slug");--> statement-breakpoint
CREATE INDEX "items_listing_idx" ON "items" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "items_available_from_idx" ON "items" USING btree ("available_from");--> statement-breakpoint
CREATE INDEX "messages_claim_idx" ON "messages" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "otp_codes_phone_hash_idx" ON "otp_codes" USING btree ("phone_hash");