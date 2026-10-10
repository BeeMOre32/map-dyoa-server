-- 최근 인기 클립 후보 큐

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClipCandidateStatus') THEN
    CREATE TYPE "ClipCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'DISMISSED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "ClipCandidate" (
  "id"           TEXT NOT NULL,
  "clipUid"      TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "readCount"    INTEGER NOT NULL DEFAULT 0,
  "streamerId"   TEXT NOT NULL,
  "streamerName" TEXT NOT NULL,
  "clipDate"     TIMESTAMPTZ(3),
  "status"       "ClipCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "detectedAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"   TIMESTAMPTZ(3),
  "clipId"       TEXT,
  CONSTRAINT "ClipCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClipCandidate_clipUid_key"
  ON "ClipCandidate" ("clipUid");

CREATE INDEX IF NOT EXISTS "ClipCandidate_status_readCount_idx"
  ON "ClipCandidate" ("status", "readCount" DESC);

CREATE INDEX IF NOT EXISTS "ClipCandidate_streamerId_idx"
  ON "ClipCandidate" ("streamerId");
