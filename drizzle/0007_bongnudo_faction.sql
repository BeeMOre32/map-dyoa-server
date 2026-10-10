ALTER TABLE "BongnudoProfile" ADD COLUMN IF NOT EXISTS "factionId" TEXT;

CREATE INDEX IF NOT EXISTS "BongnudoProfile_factionId_idx"
  ON "BongnudoProfile" ("factionId");
