import { timingSafeEqual } from "node:crypto"
import { Elysia } from "elysia"
import { clientIp } from "../lib/http-request-log"
import { reportSecurityRejection } from "../lib/security-alert"
import { logWarn } from "../lib/server-log"

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
const HEADER = "x-write-token"

const FEEDBACK_LIMIT = 30
const FEEDBACK_WINDOW_MS = 10 * 60 * 1000
const AUCTION_LIMIT = 90
const AUCTION_WINDOW_MS = 60 * 1000
const BUCKET_CAP = 5000

const buckets = new Map<string, number[]>()

function tokensMatch(presented: string, expected: string): boolean {
  const left = Buffer.from(presented)
  const right = Buffer.from(expected)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function takeSlot(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs)
  if (recent.length >= limit) {
    buckets.set(key, recent)
    return false
  }
  recent.push(now)
  buckets.set(key, recent)
  if (buckets.size > BUCKET_CAP) {
    const oldest = buckets.keys().next().value
    if (oldest) buckets.delete(oldest)
  }
  return true
}

function reject(
  set: { status?: number | string },
  request: Request,
  path: string,
  reason: "missing_token" | "bad_token" | "rate_limited",
  status: 401 | 429,
) {
  const ip = clientIp(request) ?? "unknown"
  logWarn("security_rejected", {
    type: "security",
    reason,
    method: request.method,
    path,
    clientIp: ip,
  })
  reportSecurityRejection({
    reason,
    method: request.method,
    path,
    clientIp: ip,
  })
  set.status = status
  return {
    error: status === 429 ? ("RATE_LIMITED" as const) : ("UNAUTHORIZED" as const),
  }
}

function isFeedbackCreate(method: string, path: string): boolean {
  return method === "POST" && (path === "/feedbacks" || path === "/feedbacks/")
}

function isAuctionWrite(method: string, path: string): boolean {
  return WRITE_METHODS.has(method) && (path === "/auctions" || path.startsWith("/auctions/"))
}

function isOpenApi(path: string): boolean {
  return path === "/openapi" || path.startsWith("/openapi/")
}

/**
 * 수정·삭제는 `API_WRITE_TOKEN` 이 있을 때만 `x-write-token` 을 요구한다.
 * API 문서도 같은 헤더가 있을 때만 연다.
 * 의견 작성과 경매는 공개로 두고, 횟수를 넘기면 같은 보안 로그를 남긴다.
 */
export const writeGuard = new Elysia({ name: "write-guard" }).onBeforeHandle(
  { as: "global" },
  ({ request, set }) => {
    const method = request.method.toUpperCase()
    const path = new URL(request.url).pathname
    const expected = process.env.API_WRITE_TOKEN?.trim()

    if (isOpenApi(path)) {
      if (!expected) return
      const presented = request.headers.get(HEADER)?.trim() ?? ""
      if (!presented) return reject(set, request, path, "missing_token", 401)
      if (!tokensMatch(presented, expected)) return reject(set, request, path, "bad_token", 401)
      return
    }

    if (!WRITE_METHODS.has(method)) return

    const presented = request.headers.get(HEADER)?.trim() ?? ""
    const trusted = Boolean(expected && presented && tokensMatch(presented, expected))

    if (isFeedbackCreate(method, path) || isAuctionWrite(method, path)) {
      const feedback = isFeedbackCreate(method, path)
      if (!(feedback && trusted)) {
        const ip = clientIp(request) ?? "unknown"
        const allowed = takeSlot(
          `${feedback ? "feedback" : "auction"}:${ip}`,
          feedback ? FEEDBACK_LIMIT : AUCTION_LIMIT,
          feedback ? FEEDBACK_WINDOW_MS : AUCTION_WINDOW_MS,
        )
        if (!allowed) return reject(set, request, path, "rate_limited", 429)
      }
      return
    }

    if (!expected) return

    if (!presented) return reject(set, request, path, "missing_token", 401)
    if (!tokensMatch(presented, expected)) return reject(set, request, path, "bad_token", 401)
  },
)
