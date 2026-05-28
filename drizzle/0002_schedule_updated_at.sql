ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp (3) with time zone;--> statement-breakpoint
UPDATE "Schedule" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;--> statement-breakpoint
ALTER TABLE "Schedule" ALTER COLUMN "updatedAt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Schedule" ALTER COLUMN "updatedAt" SET DEFAULT now();
