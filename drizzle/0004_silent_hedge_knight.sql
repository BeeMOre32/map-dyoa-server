ALTER TABLE "AuctionRoom" ADD COLUMN IF NOT EXISTS "scheduleId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AuctionRoom" ADD CONSTRAINT "AuctionRoom_scheduleId_Schedule_id_fk" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuctionRoom_scheduleId_idx" ON "AuctionRoom" USING btree ("scheduleId");
