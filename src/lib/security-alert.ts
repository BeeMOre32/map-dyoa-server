import * as Sentry from "@sentry/elysia"

export type SecurityRejectReason = "missing_token" | "bad_token" | "rate_limited"

export type SecurityRejection = {
  reason: SecurityRejectReason
  method: string
  path: string
  clientIp: string
}

const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 30
const KEY_CAP = 2000

const TITLE: Record<SecurityRejectReason, string> = {
  missing_token: "토큰 없는 수정 시도",
  bad_token: "틀린 쓰기 토큰",
  rate_limited: "요청 횟수 초과",
}

const recent = new Map<string, number>()
let windowStart = 0
let windowCount = 0

function alertsEnabled(): boolean {
  if (process.env.SECURITY_ALERTS === "0") return false
  return Boolean(process.env.SENTRY_DSN?.trim())
}

function sendToSentry(event: SecurityRejection): void {
  if (!alertsEnabled()) return
  Sentry.captureMessage(TITLE[event.reason], {
    level: "warning",
    tags: {
      type: "security",
      security_reason: event.reason,
    },
    extra: {
      method: event.method,
      path: event.path,
      clientIp: event.clientIp,
    },
    fingerprint: ["security_rejected", event.reason],
  })
}

/** 같은 주소·경로·이유는 10분에 한 번, 전체는 10분에 30건까지 Sentry로 보낸다. */
export function reportSecurityRejection(
  event: SecurityRejection,
  send: (event: SecurityRejection) => void = sendToSentry,
  now = Date.now(),
): boolean {
  const key = `${event.reason}\0${event.clientIp}\0${event.method}\0${event.path}`
  const prev = recent.get(key)
  if (prev !== undefined && now - prev < WINDOW_MS) return false

  if (windowStart === 0 || now - windowStart >= WINDOW_MS) {
    windowStart = now
    windowCount = 0
  }
  if (windowCount >= MAX_PER_WINDOW) return false

  windowCount += 1
  recent.set(key, now)
  if (recent.size > KEY_CAP) {
    const oldest = recent.keys().next().value
    if (oldest) recent.delete(oldest)
  }
  send(event)
  return true
}

export function resetSecurityAlertsForTests(): void {
  recent.clear()
  windowStart = 0
  windowCount = 0
}
