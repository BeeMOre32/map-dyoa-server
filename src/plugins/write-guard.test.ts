import { afterEach, describe, expect, test } from "bun:test"
import { Elysia } from "elysia"
import { writeGuard } from "./write-guard"

process.env.SECURITY_ALERTS = "0"

const TOKEN = "test-write-token"
const savedToken = process.env.API_WRITE_TOKEN

const api = new Elysia()
  .use(writeGuard)
  .get("/", () => ({ ok: true as const }))
  .get("/openapi", () => ({ docs: true as const }))
  .get("/openapi/json", () => ({ openapi: "3.0.0" }))
  .post("/schedules", () => ({ created: true as const }))
  .put("/schedules/:id", () => ({ updated: true as const }))
  .delete("/schedules/:id", () => ({ deleted: true as const }))
  .post("/feedbacks", () => ({ id: "feedback" }))
  .patch("/feedbacks/:id/reject", () => ({ ok: true as const }))
  .post("/auctions", () => ({ room: true as const }))

afterEach(() => {
  if (savedToken === undefined) delete process.env.API_WRITE_TOKEN
  else process.env.API_WRITE_TOKEN = savedToken
})

async function send(
  method: string,
  path: string,
  headers?: Record<string, string>,
) {
  const res = await api.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : "{}",
    }),
  )
  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

describe("쓰기 보호", () => {
  test("토큰이 없으면 수정을 막지 않는다", async () => {
    delete process.env.API_WRITE_TOKEN
    const res = await send("POST", "/schedules")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ created: true })
  })

  test("토큰이 있으면 헤더 없는 수정·삭제·문서 요청을 거절한다", async () => {
    process.env.API_WRITE_TOKEN = TOKEN
    const schedules = await send("POST", "/schedules")
    const updated = await send("PUT", "/schedules/1")
    const deleted = await send("DELETE", "/schedules/1")
    const reject = await send("PATCH", "/feedbacks/1/reject")
    const docs = await send("GET", "/openapi")
    const spec = await send("GET", "/openapi/json")

    for (const res of [schedules, updated, deleted, reject, docs, spec]) {
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: "UNAUTHORIZED" })
    }
  })

  test("틀린 헤더는 거절하고 맞는 헤더는 통과한다", async () => {
    process.env.API_WRITE_TOKEN = TOKEN
    const wrong = await send("POST", "/schedules", { "x-write-token": "nope" })
    const right = await send("POST", "/schedules", { "x-write-token": TOKEN })
    const docs = await send("GET", "/openapi", { "x-write-token": TOKEN })

    expect(wrong.status).toBe(401)
    expect(wrong.body).toEqual({ error: "UNAUTHORIZED" })
    expect(right.status).toBe(200)
    expect(docs.status).toBe(200)
  })

  test("조회는 헤더 없이 통과한다", async () => {
    process.env.API_WRITE_TOKEN = TOKEN
    const res = await send("GET", "/")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  test("거절 로그에 경로와 들어온 주소만 남긴다", async () => {
    process.env.API_WRITE_TOKEN = TOKEN
    const lines: string[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => {
      lines.push(args.map((arg) => String(arg)).join(" "))
    }
    try {
      await send("POST", "/schedules", { "fly-client-ip": "203.0.113.10" })
    } finally {
      console.warn = original
    }

    const line = lines.find((entry) => entry.includes("security_rejected"))
    expect(line).toBeDefined()
    expect(line).toContain("/schedules")
    expect(line).toContain("203.0.113.10")
    expect(line).not.toContain(TOKEN)
  })

  test("의견 작성은 헤더 없이 열리고, 한도를 넘기면 거절한다", async () => {
    process.env.API_WRITE_TOKEN = TOKEN
    const headers = { "fly-client-ip": "203.0.113.20" }
    let last = 0
    for (let i = 0; i < 30; i++) {
      last = (await send("POST", "/feedbacks", headers)).status
    }
    expect(last).toBe(200)

    const blocked = await send("POST", "/feedbacks", headers)
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({ error: "RATE_LIMITED" })

    const trusted = await send("POST", "/feedbacks", {
      ...headers,
      "x-write-token": TOKEN,
    })
    expect(trusted.status).toBe(200)
  })

  test("경매 쓰기는 헤더 없이 열리고, 한도를 넘기면 거절한다", async () => {
    process.env.API_WRITE_TOKEN = TOKEN
    const headers = { "fly-client-ip": "203.0.113.30" }
    let last = 0
    for (let i = 0; i < 90; i++) {
      last = (await send("POST", "/auctions", headers)).status
    }
    expect(last).toBe(200)

    const blocked = await send("POST", "/auctions", headers)
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({ error: "RATE_LIMITED" })
  })
})

const live = process.env.WRITE_GUARD_LIVE === "1" ? test : test.skip
const origin = process.env.WRITE_GUARD_ORIGIN ?? "https://map-dyoa-server.fly.dev"

describe("배포된 서버", () => {
  live("조회는 열려 있고 수정과 문서는 막혀 있다", async () => {
    const root = await fetch(`${origin}/`)
    const schedules = await fetch(`${origin}/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    const docs = await fetch(`${origin}/openapi`)
    const feedback = await fetch(`${origin}/feedbacks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    const reject = await fetch(`${origin}/feedbacks/missing/reject`, { method: "PATCH" })

    expect(root.status).toBe(200)
    expect(schedules.status).toBe(401)
    expect(docs.status).toBe(401)
    expect(feedback.status).toBe(400)
    expect(reject.status).toBe(401)
  })
})
