import { Elysia } from "elysia"
import { logHttp } from "../lib/server-log"

const REQUEST_ID_HEADER = "x-request-id"

/** 요청 단위 경과 시간 + 상태 코드 로그 */
export const httpLogPlugin = new Elysia({ name: "http-log" })
  .derive(() => ({
    httpLogStartedAt: Date.now(),
  }))
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
    logHttp(request.method, url.pathname, url.search, status, ms, rid)
  })
