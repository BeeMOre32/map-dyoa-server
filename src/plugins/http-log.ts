import { Elysia } from "elysia"
import { logHttp } from "../lib/server-log"

const REQUEST_ID_HEADER = "x-request-id"

type WithRequestStartedAt = { requestStartedAt?: number }

/** 요청 단위 경과 시간 + 상태 코드 로그 (`request-trace`의 `requestStartedAt`과 동일 시각 기준) */
export const httpLogPlugin = new Elysia({ name: "http-log" })
  .derive((ctx) => {
    const requestStartedAt = (ctx as WithRequestStartedAt).requestStartedAt
    return {
      httpLogStartedAt:
        typeof requestStartedAt === "number" && Number.isFinite(requestStartedAt)
          ? requestStartedAt
          : Date.now(),
    }
  })
  .onAfterHandle(({ request, set, httpLogStartedAt }) => {
    const url = new URL(request.url)
    const status = typeof set.status === "number" && set.status > 0 ? set.status : 200
    const ms = Date.now() - httpLogStartedAt
    const headerVal = set.headers[REQUEST_ID_HEADER]
    const rid =
      typeof headerVal === "string"
        ? headerVal
        : Array.isArray(headerVal)
          ? headerVal[0]
          : undefined
    const rawUa = request.headers.get("user-agent")
    const userAgent =
      rawUa && rawUa.length > 240 ? `${rawUa.slice(0, 240)}…` : rawUa ?? undefined
    logHttp(request.method, url.pathname, url.search, status, ms, rid, {
      ...(userAgent ? { userAgent } : {}),
    })
  })
