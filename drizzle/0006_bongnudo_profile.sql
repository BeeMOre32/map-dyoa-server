CREATE TABLE IF NOT EXISTS "BongnudoProfile" (
  "id" TEXT NOT NULL,
  "seasonKey" TEXT NOT NULL DEFAULT 'bongnudo2',
  "streamerId" TEXT NOT NULL,
  "rpName" TEXT,
  "occupation" TEXT,
  "concept" TEXT,
  "notes" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BongnudoProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BongnudoProfile_seasonKey_streamerId_key"
  ON "BongnudoProfile" ("seasonKey", "streamerId");

CREATE INDEX IF NOT EXISTS "BongnudoProfile_streamerId_idx"
  ON "BongnudoProfile" ("streamerId");

CREATE INDEX IF NOT EXISTS "BongnudoProfile_seasonKey_idx"
  ON "BongnudoProfile" ("seasonKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BongnudoProfile_streamerId_Streamer_id_fk'
  ) THEN
    ALTER TABLE "BongnudoProfile"
      ADD CONSTRAINT "BongnudoProfile_streamerId_Streamer_id_fk"
      FOREIGN KEY ("streamerId") REFERENCES "Streamer"("id") ON DELETE CASCADE;
  END IF;
END $$;
