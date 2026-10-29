-- 피드백 답변과 제출자 확인용 해시. 원문 토큰은 저장하지 않는다.

ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "reply" TEXT;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "receiptHash" TEXT;
