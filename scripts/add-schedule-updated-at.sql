-- Schedule.updatedAt (낙관적 동시성) — map-dyoa와 동일
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

UPDATE "Schedule"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

ALTER TABLE "Schedule" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Schedule" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
