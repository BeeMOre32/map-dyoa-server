import { expect, test } from "bun:test"
import { kstWeekKey, kstWeekStartIso } from "./kst-week"

test("금요일은 그 주 월요일로 묶인다", () => {
  expect(kstWeekKey(new Date("2026-10-15T15:00:00.000Z"))).toBe("2026-10-12")
})

test("일요일도 같은 월요일로 묶인다", () => {
  expect(kstWeekKey(new Date("2026-10-18T01:00:00.000Z"))).toBe("2026-10-12")
})

test("다음 월요일 0시 30분은 새 주다", () => {
  expect(kstWeekKey(new Date("2026-10-18T15:30:00.000Z"))).toBe("2026-10-19")
})

test("주 시작은 월요일 0시 KST다", () => {
  expect(kstWeekStartIso(new Date("2026-10-15T15:00:00.000Z"))).toBe(
    "2026-10-11T15:00:00.000Z",
  )
  expect(kstWeekStartIso(new Date("2026-10-18T15:30:00.000Z"))).toBe(
    "2026-10-18T15:00:00.000Z",
  )
})
