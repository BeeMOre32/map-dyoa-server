-- 캘린더 구간 조회(startTime BETWEEN)용
CREATE INDEX IF NOT EXISTS "Schedule_startTime_idx" ON "Schedule" ("startTime");
