import { Elysia } from "elysia"
import { buildHttpRequestFields } from "../lib/http-request-log"
import { logHttp } from "../lib/server-log"

const REQUEST_ID_HEADER = "x-request-id"

type WithRequestStartedAt = { requestStartedAt?: number }

/** 모든 HTTP 요청: 요청·응답·쿼리·본문 요약을 한 줄 JSON으로 기록 */
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
  .onAfterHandle(({ request, set, response, query, params, body, httpLogStartedAt }) => {
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

    const fields = buildHttpRequestFields(request, {
      pathname: url.pathname,
      search: url.search,
      status,
      durationMs: ms,
      requestId: rid,
      query,
      params,
      body,
      response,
    })

    logHttp(request.method, url.pathname, url.search, status, ms, rid, fields)
  })
