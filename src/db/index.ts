import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error("DATABASE_URL 환경 변수가 필요함")
}

function isSupabaseUrl(connectionUrl: string): boolean {
  /** 풀러(*.pooler.supabase.com)와 직결(db.*.supabase.co) 둘 다 인식해 SSL을 적용 */
  try {
    const u = new URL(connectionUrl.replace(/^postgres:/, "postgresql:"))
    return u.hostname.includes("supabase.com") || u.hostname.includes("supabase.co")
  } catch {
    return connectionUrl.includes("supabase.com") || connectionUrl.includes("supabase.co")
  }
}

function useTransactionPooler(connectionUrl: string): boolean {
  try {
    const u = new URL(connectionUrl.replace(/^postgres:/, "postgresql:"))
    return (
      u.port === "6543" ||
      u.searchParams.get("pgbouncer") === "true"
    )
  } catch {
    return connectionUrl.includes(":6543") || connectionUrl.includes("pgbouncer=true")
  }
}

const max = Number(process.env.DB_POOL_MAX ?? 10)
const connectTimeout = Number(process.env.DB_CONNECT_TIMEOUT ?? 15)
/**
 * 0이면 유휴 연결을 닫지 않고 재사용한다.
 * Supavisor 공유 풀러로의 재연결 핸드셰이크 폭주(간헐적 CONNECT_TIMEOUT)를 줄이기 위해 기본값을 0으로 둔다.
 */
const idleTimeout = Number(process.env.DB_IDLE_TIMEOUT ?? 0)
/** 좀비 연결 방지용 최대 수명(초). 기본 30분. */
const maxLifetime = Number(process.env.DB_MAX_LIFETIME ?? 60 * 30)
const supabase = isSupabaseUrl(url)
const transactionPooler = useTransactionPooler(url)

const client = postgres(url, {
  max,
  connect_timeout: connectTimeout,
  idle_timeout: idleTimeout,
  max_lifetime: maxLifetime,
  ...(supabase ? { ssl: "require" as const } : {}),
  /** Supavisor transaction mode(:6543)에서는 prepared statement 비활성화 */
  ...(transactionPooler ? { prepare: false } : {}),
})

export const db = drizzle(client, { schema })

/** 풀러로의 연결이 간헐적으로 끊길 때 나타나는 일시적 오류 코드 */
const TRANSIENT_DB_ERROR_CODES = new Set([
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
])

function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const code = (err as { code?: unknown }).code
  if (typeof code === "string" && TRANSIENT_DB_ERROR_CODES.has(code)) return true
  const message = (err as { message?: unknown }).message
  return typeof message === "string" && /CONNECT_TIMEOUT|connection.*(closed|terminated|reset)/i.test(message)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 일시적 연결 오류(주로 Supavisor 풀러의 간헐적 CONNECT_TIMEOUT)에 한해 재시도한다.
 * 쿼리 자체 오류(문법·제약 위반 등)는 재시도하지 않고 즉시 던진다.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 2
  const baseDelayMs = opts?.baseDelayMs ?? 150
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === retries || !isTransientDbError(err)) throw err
      await sleep(baseDelayMs * 2 ** attempt)
    }
  }
  throw lastErr
}

export { client, schema }
