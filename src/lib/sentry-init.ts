import * as Sentry from "@sentry/elysia"
import type { ErrorContext } from "elysia"

function parseSampleRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback
  return n
}

/**
 * Sentry는 DSN이 있을 때만 켜집니다. Fly 등에서는 `SENTRY_DSN` 시크릿을 넣으면 됩니다.
 */
export function initSentryFromEnv(): void {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return

  // 무료 티어: Issues(오류 이벤트)만 쓰고 Performance·Logs 쿼터는 기본으로 끔.
  // 트레이싱이 필요하면 `SENTRY_TRACES_SAMPLE_RATE`만 0 초과로 설정 (과금·쿼터 확인).
  const tracesSampleRate = parseSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    0,
  )
  const sendDefaultPii = process.env.SENTRY_SEND_DEFAULT_PII === "1"

  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() ||
      process.env.FLY_REGION ||
      process.env.NODE_ENV ||
      "development",
    release: process.env.SENTRY_RELEASE?.trim(),
    tracesSampleRate,
    sendDefaultPii,
    enableLogs: false,
  })
}

/** 4xx·검증은 Issues에 올리지 않고, 서버 오류(5xx)만 보고 */
export function sentryShouldCaptureElysiaError(context: ErrorContext): boolean {
  const code =
    "code" in context && context.code !== undefined ? String(context.code) : ""
  if (code === "VALIDATION" || code === "NOT_FOUND" || code === "PARSE") {
    return false
  }
  const status = context.set.status
  if (status === undefined) return true
  const n = Number.parseInt(String(status), 10)
  if (Number.isNaN(n)) return true
  return n >= 500
}
