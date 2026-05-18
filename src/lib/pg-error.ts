import type { LogFields } from "./server-log"

/** postgres / postgres.js 오류 코드 */
export function pgCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const c = (e as { code?: unknown }).code
    return typeof c === "string" ? c : undefined
  }
  return undefined
}

/** Fly/Loki에서 FK·unique 위반 원인 추적용 */
export function pgErrorFields(e: unknown): LogFields {
  if (typeof e !== "object" || e === null) return {}
  const o = e as Record<string, unknown>
  const out: LogFields = {}
  if (typeof o.code === "string") out.pgCode = o.code
  if (typeof o.constraint === "string") out.pgConstraint = o.constraint
  if (typeof o.detail === "string") out.pgDetail = o.detail
  if (typeof o.table === "string") out.pgTable = o.table
  return out
}
