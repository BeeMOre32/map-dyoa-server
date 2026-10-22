import { afterEach, describe, expect, test } from "bun:test"
import {
  reportSecurityRejection,
  resetSecurityAlertsForTests,
  type SecurityRejection,
} from "./security-alert"

function event(over: Partial<SecurityRejection> = {}): SecurityRejection {
  return {
    reason: "bad_token",
    method: "POST",
    path: "/schedules",
    clientIp: "203.0.113.10",
    ...over,
  }
}

afterEach(() => {
  resetSecurityAlertsForTests()
})

describe("보안 경고", () => {
  test("같은 접근은 10분에 한 번만 보낸다", () => {
    const sent: SecurityRejection[] = []
    const now = 1_000_000
    expect(reportSecurityRejection(event(), (item) => sent.push(item), now)).toBe(true)
    expect(reportSecurityRejection(event(), (item) => sent.push(item), now + 1_000)).toBe(
      false,
    )
    expect(reportSecurityRejection(event(), (item) => sent.push(item), now + 10 * 60 * 1000)).toBe(
      true,
    )
    expect(sent).toHaveLength(2)
  })

  test("10분 동안 30건을 넘기면 더 보내지 않는다", () => {
    const sent: SecurityRejection[] = []
    const now = 2_000_000
    for (let i = 0; i < 35; i++) {
      reportSecurityRejection(
        event({ clientIp: `203.0.113.${i}` }),
        (item) => sent.push(item),
        now,
      )
    }
    expect(sent).toHaveLength(30)
  })
})
