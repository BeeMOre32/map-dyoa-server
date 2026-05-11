import { Elysia } from "elysia"
import { logHttp } from "../lib/server-log"

/** 요청 단위 경과 시간 + 상태 코드 로그 */
export const httpLogPlugin = new Elysia({ name: "http-log" })
  .derive(() => ({
    httpLogStartedAt: Date.now(),
  }))
  .onAfterHandle(({ request, set, httpLogStartedAt }) => {
    const url = new URL(request.url)
    const status = typeof set.status === "number" && set.status > 0 ? set.status : 200
    const ms = Date.now() - httpLogStartedAt
    logHttp(request.method, url.pathname, url.search, status, ms)
  })
