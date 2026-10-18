-- 클립 추천. 한 사람(브라우저)당 한 표. 수는 주가 바뀌어도 유지된다.

CREATE TABLE IF NOT EXISTS "ClipRecommend" (
  "id"        TEXT NOT NULL,
  "clipId"    TEXT NOT NULL,
  "voterKey"  TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClipRecommend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClipRecommend_clipId_voterKey_key"
  ON "ClipRecommend" ("clipId", "voterKey");

CREATE INDEX IF NOT EXISTS "ClipRecommend_clipId_idx"
  ON "ClipRecommend" ("clipId");

CREATE INDEX IF NOT EXISTS "ClipRecommend_createdAt_idx"
  ON "ClipRecommend" ("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClipRecommend_clipId_Clip_id_fk'
  ) THEN
    ALTER TABLE "ClipRecommend"
      ADD CONSTRAINT "ClipRecommend_clipId_Clip_id_fk"
      FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE;
  END IF;
END
$$;
