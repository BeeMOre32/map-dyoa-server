import { getRequestId } from "./request-context"

type LogFields = Record<string, string | number | boolean | undefined>

function formatFields(fields: LogFields): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")
}

function withRequestId(fields: LogFields): LogFields {
  const rid = getRequestId()
  if (!rid || fields.requestId !== undefined) return fields
  return { ...fields, requestId: rid }
}

/** 일정·참가자(ScheduleParticipant) 조회 등 */
export function logSchedules(scope: string, fields: LogFields): void {
  console.log(`[schedules] ${scope} ${formatFields(withRequestId(fields))}`)
}

export function logApi(tag: string, fields: LogFields): void {
  console.log(`[${tag}] ${formatFields(withRequestId(fields))}`)
}

/**
 * 서비스/함수 경계 진입 로그. `logApi`와 동일하게 requestId 자동 병합.
 * `phase` 기본값 `enter` (호출부에서 덮어쓸 수 있음).
 */
export function logTrace(scope: string, fields: LogFields = {}): void {
  logApi(`trace.${scope}`, { phase: "enter", ...fields })
}

/** 모든 HTTP 요청 한 줄 요약 */
export function logHttp(
  method: string,
  pathname: string,
  search: string,
  status: number,
  ms: number,
  requestId?: string,
): void {
  const q = search && search !== "" ? search : ""
  const rid = requestId ? ` requestId=${requestId}` : ""
  console.log(`[http] ${method} ${pathname}${q} ${status} ${ms}ms${rid}`)
}
