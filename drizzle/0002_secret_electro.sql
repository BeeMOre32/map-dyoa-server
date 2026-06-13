CREATE TABLE "AuctionBid" (
	"id" text PRIMARY KEY NOT NULL,
	"roomId" text NOT NULL,
	"nomineeId" text NOT NULL,
	"factionId" text NOT NULL,
	"amount" integer NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuctionFaction" (
	"id" text PRIMARY KEY NOT NULL,
	"roomId" text NOT NULL,
	"name" text NOT NULL,
	"colorCode" text DEFAULT '#673AB7' NOT NULL,
	"joinToken" text NOT NULL,
	"budgetTotal" integer DEFAULT 1000 NOT NULL,
	"budgetRemaining" integer DEFAULT 1000 NOT NULL,
	"orderIndex" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuctionNominee" (
	"id" text PRIMARY KEY NOT NULL,
	"roomId" text NOT NULL,
	"name" text NOT NULL,
	"imageUrl" text,
	"streamerId" text,
	"status" text DEFAULT 'WAITING' NOT NULL,
	"wonByFactionId" text,
	"finalPrice" integer,
	"orderIndex" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuctionRoom" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'LOBBY' NOT NULL,
	"minIncrement" integer DEFAULT 10 NOT NULL,
	"currentNomineeId" text,
	"hostToken" text NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AuctionRoom_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_roomId_AuctionRoom_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."AuctionRoom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_nomineeId_AuctionNominee_id_fk" FOREIGN KEY ("nomineeId") REFERENCES "public"."AuctionNominee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_factionId_AuctionFaction_id_fk" FOREIGN KEY ("factionId") REFERENCES "public"."AuctionFaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AuctionFaction" ADD CONSTRAINT "AuctionFaction_roomId_AuctionRoom_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."AuctionRoom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AuctionNominee" ADD CONSTRAINT "AuctionNominee_roomId_AuctionRoom_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."AuctionRoom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AuctionNominee" ADD CONSTRAINT "AuctionNominee_streamerId_Streamer_id_fk" FOREIGN KEY ("streamerId") REFERENCES "public"."Streamer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "AuctionBid_roomId_nomineeId_idx" ON "AuctionBid" USING btree ("roomId","nomineeId");--> statement-breakpoint
CREATE UNIQUE INDEX "AuctionFaction_roomId_orderIndex_key" ON "AuctionFaction" USING btree ("roomId","orderIndex");--> statement-breakpoint
CREATE INDEX "AuctionFaction_joinToken_idx" ON "AuctionFaction" USING btree ("joinToken");--> statement-breakpoint
CREATE INDEX "AuctionFaction_roomId_idx" ON "AuctionFaction" USING btree ("roomId");--> statement-breakpoint
CREATE INDEX "AuctionNominee_roomId_idx" ON "AuctionNominee" USING btree ("roomId");--> statement-breakpoint
CREATE INDEX "AuctionNominee_streamerId_idx" ON "AuctionNominee" USING btree ("streamerId");