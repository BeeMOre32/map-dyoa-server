import type { LogFields } from "./server-log"

const MAX_HEADER_LEN = 512
const MAX_BODY_JSON = 4_096
const MAX_STRING_PREVIEW = 800

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

export function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("fly-client-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    undefined
  )
}

export function headerTrim(request: Request, name: string): string | undefined {
  const v = request.headers.get(name)?.trim()
  if (!v) return undefined
  return v.length > MAX_HEADER_LEN ? truncate(v, MAX_HEADER_LEN) : v
}

export function queryParamsRecord(search: string): Record<string, string> {
  const out: Record<string, string> = {}
  const raw = search.startsWith("?") ? search.slice(1) : search
  if (!raw) return out
  for (const [k, v] of new URLSearchParams(raw)) {
    if (k in out) out[k] = `${out[k]},${v}`
    else out[k] = v
  }
  return out
}

function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

/** 요청 본문·쿼리·경로 파라미터 요약 (민감 필드 마스킹) */
export function summarizePayload(value: unknown, label: string): LogFields {
  if (value === undefined || value === null) return {}
  if (typeof value === "string") {
    return {
      [`${label}Type`]: "string",
      [`${label}Bytes`]: value.length,
      [`${label}Preview`]: truncate(value, MAX_STRING_PREVIEW),
    }
  }
  if (typeof value !== "object") {
    return { [`${label}Value`]: truncate(String(value), 200) }
  }

  const redacted = redactSensitive(value)
  const json = safeJsonStringify(redacted)
  if (!json) return { [`${label}Type`]: "object", [`${label}Serialize`]: "failed" }

  if (json.length <= MAX_BODY_JSON) {
    return { [`${label}Json`]: json, [`${label}Bytes`]: json.length }
  }
  return {
    [`${label}Json`]: truncate(json, MAX_BODY_JSON),
    [`${label}Bytes`]: json.length,
    [`${label}Truncated`]: true,
  }
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive)
  if (value === null || typeof value !== "object") return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/password|secret|token|authorization/i.test(k)) {
      out[k] = "[redacted]"
    } else {
      out[k] = redactSensitive(v)
    }
  }
  return out
}

const COUNT_KEYS = [
  "streamers",
  "games",
  "schedules",
  "clips",
  "feedbacks",
  "months",
  "liveStreamerIds",
  "created",
] as const

/** 응답 객체에서 상태·에러·배열 길이·소형 JSON 본문 추출 */
export function summarizeResponse(body: unknown, status: number): LogFields {
  const fields: LogFields = {
    outcome: status >= 500 ? "server_error" : status >= 400 ? "client_error" : "ok",
  }

  if (body === undefined || body === null) {
    fields.responseEmpty = true
    return fields
  }

  if (typeof body === "string") {
    fields.responseType = "string"
    fields.responseBytes = body.length
    fields.responsePreview = truncate(body, MAX_STRING_PREVIEW)
    return fields
  }

  if (typeof body !== "object") {
    fields.responseValue = truncate(String(body), 200)
    return fields
  }

  const o = body as Record<string, unknown>
  fields.responseType = "object"

  if ("error" in o && o.error !== undefined) fields.responseError = String(o.error)
  if ("code" in o && o.code !== undefined) fields.responseCode = String(o.code)
  if ("message" in o && typeof o.message === "string") {
    fields.responseMessage = truncate(o.message, 500)
  }
  if ("ok" in o) fields.responseOk = Boolean(o.ok)

  for (const key of COUNT_KEYS) {
    if (Array.isArray(o[key])) {
      fields[`response${key.charAt(0).toUpperCase()}${key.slice(1)}Count`] = o[key].length
    }
  }

  if (Array.isArray(o.liveStreamerIds) && o.liveStreamerIds.every((x) => typeof x === "string")) {
    fields.liveStreamerIds = o.liveStreamerIds as string[]
  }

  const json = safeJsonStringify(body)
  if (json) {
    if (json.length <= MAX_BODY_JSON) {
      fields.responseJson = json
    } else {
      fields.responseJson = truncate(json, MAX_BODY_JSON)
      fields.responseJsonTruncated = true
      fields.responseJsonBytes = json.length
    }
  }

  return fields
}

export function truncateJson(value: unknown, max = 2_048): string | undefined {
  const json = safeJsonStringify(value)
  if (!json) return undefined
  return json.length <= max ? json : `${json.slice(0, max)}…`
}

export function buildHttpRequestFields(
  request: Request,
  opts: {
    pathname: string
    search: string
    status: number
    durationMs: number
    requestId?: string
    query?: unknown
    params?: unknown
    body?: unknown
    response?: unknown
  },
): LogFields {
  const qRecord = queryParamsRecord(opts.search)
  const rawUa = request.headers.get("user-agent")
  const userAgent =
    rawUa && rawUa.length > 240 ? `${rawUa.slice(0, 240)}…` : rawUa ?? undefined

  return {
    type: "http_access",
    phase: "complete",
    method: request.method,
    path: opts.pathname,
    queryString: opts.search && opts.search !== "" ? opts.search : undefined,
    ...(Object.keys(qRecord).length > 0 ? { queryParams: JSON.stringify(qRecord) } : {}),
    status: opts.status,
    durationMs: opts.durationMs,
    ...(opts.requestId ? { requestId: opts.requestId } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(clientIp(request) ? { clientIp: clientIp(request) } : {}),
    referer: headerTrim(request, "referer"),
    origin: headerTrim(request, "origin"),
    contentType: headerTrim(request, "content-type"),
    contentLength: headerTrim(request, "content-length"),
    accept: headerTrim(request, "accept"),
    ...summarizePayload(opts.params, "routeParams"),
    ...summarizePayload(opts.query ?? (Object.keys(qRecord).length ? qRecord : undefined), "query"),
    ...(["POST", "PUT", "PATCH"].includes(request.method)
      ? summarizePayload(opts.body, "requestBody")
      : {}),
    ...summarizeResponse(opts.response, opts.status),
  }
}
