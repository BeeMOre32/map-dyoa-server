import { Elysia, ValidationError } from "elysia"
import { setRequestContext } from "../lib/request-context"

const REQUEST_ID_HEADER = "x-request-id"
/** 클라이언트가 넘긴 ID는 짧은 ASCII만 허용 (헤더 주입 완화) */
const SAFE_REQUEST_ID = /^[a-zA-Z0-9-]{1,128}$/

export function readOrCreateRequestId(request: Request): string {
  const raw = request.headers.get(REQUEST_ID_HEADER)?.trim()
  if (raw && SAFE_REQUEST_ID.test(raw)) return raw
  return crypto.randomUUID()
}

/**
 * 요청 단위 추적: x-request-id 보장, 오류 응답에 requestId·path 포함
 */
export const requestTracePlugin = new Elysia({ name: "request-trace" })
  .derive(({ request }) => ({
    requestId: readOrCreateRequestId(request),
  }))
  .onBeforeHandle(({ requestId }) => {
    setRequestContext(requestId)
  })
  .onAfterHandle(({ requestId, set }) => {
    set.headers[REQUEST_ID_HEADER] = requestId
  })
  .onError(({ request, error, code, set, requestId }) => {
    const rid = typeof requestId === "string" ? requestId : readOrCreateRequestId(request)
    set.headers[REQUEST_ID_HEADER] = rid

    const url = new URL(request.url)
    const path = `${url.pathname}${url.search}`

    if (code === "VALIDATION" && error instanceof ValidationError) {
      set.status = error.status ?? 400
      return {
        ok: false as const,
        error: {
          code: "VALIDATION" as const,
          message: error.message,
          issues: error.all,
          requestId: rid,
          path,
        },
      }
    }

    if (code === "NOT_FOUND") {
      set.status = 404
      return {
        ok: false as const,
        error: {
          code: "NOT_FOUND" as const,
          message: "경로를 찾을 수 없습니다.",
          requestId: rid,
          path,
        },
      }
    }

    if (code === "PARSE") {
      set.status = 400
      return {
        ok: false as const,
        error: {
          code: "PARSE" as const,
          message: "요청 본문을 해석할 수 없습니다.",
          requestId: rid,
          path,
        },
      }
    }

    const message = error instanceof Error ? error.message : String(error)
    set.status = 500
    return {
      ok: false as const,
      error: {
        code: String(code),
        message:
          process.env.NODE_ENV === "production"
            ? "요청 처리 중 오류가 발생했습니다."
            : message,
        requestId: rid,
        path,
      },
    }
  })
