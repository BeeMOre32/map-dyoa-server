import { getRequestId } from "./request-context"

export type LogFields = Record<string, string | number | boolean | undefined | null>

const MAX_STACK = 12_000

/** `json`: 한 줄 JSON(Loki/Grafana). `text`: 기존 사람이 읽기 쉬운 형식. 비우면 production·Fly에서는 JSON. */
function useJsonLogs(): boolean {
  const f = process.env.LOG_FORMAT?.trim().toLowerCase()
  if (f === "json") return true
  if (f === "text") return false
  return process.env.NODE_ENV === "production" || Boolean(process.env.FLY_APP_NAME?.trim())
}

function serviceName(): string {
  return (
    process.env.LOG_SERVICE_NAME?.trim() ||
    process.env.FLY_APP_NAME?.trim() ||
    "map-dyoa-server"
  )
}

function flyFields(): LogFields {
  const out: LogFields = {}
  const region = process.env.FLY_REGION?.trim()
  const machine = process.env.FLY_MACHINE_ID?.trim()
  const app = process.env.FLY_APP_NAME?.trim()
  if (region) out.flyRegion = region
  if (machine) out.flyMachineId = machine
  if (app) out.flyApp = app
  return out
}

function formatFields(fields: LogFields): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === "boolean" ? String(v) : v}`)
    .join(" ")
}

function withRequestId(fields: LogFields): LogFields {
  const rid = getRequestId()
  if (!rid || fields.requestId !== undefined) return fields
  return { ...fields, requestId: rid }
}

function toJsonPayload(level: "info" | "warn" | "error", msg: string, fields: LogFields): string {
  const rid = getRequestId()
  const merged: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    service: serviceName(),
    ...flyFields(),
    ...(rid && fields.requestId === undefined ? { requestId: rid } : {}),
  }
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) merged[k] = v
  }
  return JSON.stringify(merged)
}

function writeLine(level: "info" | "warn" | "error", line: string): void {
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

/** 일정·참가자(ScheduleParticipant) 조회 등 */
export function logSchedules(scope: string, fields: LogFields): void {
  const merged = withRequestId(fields)
  if (useJsonLogs()) {
    writeLine("info", toJsonPayload("info", `schedules.${scope}`, merged))
  } else {
    console.log(`[schedules] ${scope} ${formatFields(merged)}`)
  }
}

export function logApi(tag: string, fields: LogFields = {}): void {
  const merged = withRequestId(fields)
  if (useJsonLogs()) {
    writeLine("info", toJsonPayload("info", tag, merged))
  } else {
    console.log(`[${tag}] ${formatFields(merged)}`)
  }
}

/**
 * 서비스/함수 경계 진입 로그. `logApi`와 동일하게 requestId 자동 병합.
 * `phase` 기본값 `enter` (호출부에서 덮어쓸 수 있음).
 */
export function logTrace(scope: string, fields: LogFields = {}): void {
  logApi(`trace.${scope}`, { phase: "enter", ...fields })
}

export function logWarn(msg: string, fields: LogFields = {}): void {
  const merged = withRequestId(fields)
  if (useJsonLogs()) {
    writeLine("warn", toJsonPayload("warn", msg, merged))
  } else {
    console.warn(`[warn] ${msg} ${formatFields(merged)}`)
  }
}

/**
 * 처리되지 않은 예외·500 계열 원인 추적용. 응답 본문과 별도로 스택을 로그에만 남김.
 */
export function logException(scope: string, err: unknown, fields: LogFields = {}): void {
  const e = err instanceof Error ? err : new Error(String(err))
  const stack = (e.stack ?? "").slice(0, MAX_STACK)
  const merged = withRequestId({
    ...fields,
    errName: e.name,
    errMessage: e.message,
    errStack: stack,
  })
  if (useJsonLogs()) {
    writeLine("error", toJsonPayload("error", scope, merged))
  } else {
    console.error(
      `[error] ${scope} ${formatFields(withRequestId(fields))} errName=${e.name} errMessage=${e.message}\n${stack}`,
    )
  }
}

function httpAccessLevel(status: number): "info" | "warn" | "error" {
  if (status >= 500) return "error"
  if (status >= 400) return "warn"
  return "info"
}

/** 모든 HTTP 요청 한 줄 요약 (성공·클라이언트 오류·서버 오류 공통 필드) */
export function logHttp(
  method: string,
  pathname: string,
  search: string,
  status: number,
  ms: number,
  requestId?: string,
  extra?: LogFields,
): void {
  const q = search && search !== "" ? search : ""
  const fields: LogFields = {
    type: "http_access",
    method,
    path: pathname,
    queryString: q,
    status,
    durationMs: ms,
    ...(requestId ? { requestId } : {}),
    ...extra,
  }
  const merged = withRequestId(fields)
  if (useJsonLogs()) {
    const level = httpAccessLevel(status)
    writeLine(level, toJsonPayload(level, "http_request", merged))
  } else {
    const rid = merged.requestId ? ` requestId=${merged.requestId}` : ""
    const line = `[http] ${method} ${pathname}${q} ${status} ${ms}ms${rid}`
    writeLine(httpAccessLevel(status), line)
  }
}
