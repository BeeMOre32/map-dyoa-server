import { db } from "../db"
import { logSchedules } from "../lib/server-log"
import {
  flattenScheduleParticipants,
  flattenSchedules,
  type FlattenedSchedule,
  type ScheduleWithRelations,
} from "../lib/schedule-format"

function toScheduleRow(r: unknown): ScheduleWithRelations {
  const row = r as ScheduleWithRelations
  return row
}

function toInt(v: string | number | undefined): number | undefined {
  if (v === undefined || v === "") return undefined
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10)
  return Number.isFinite(n) ? n : undefined
}

export type ListSchedulesQuery = {
  from?: string
  to?: string
  /** `2026-04` 또는 `2026년4월` / `2026년 04월` */
  period?: string
  year?: string | number
  month?: string | number
}

export type ListSchedulesResult =
  | {
      ok: true
      schedules: FlattenedSchedule[]
      /** 실제 조회에 사용된 구간 (ISO) */
      window: { from: string; to: string }
      /** ScheduleParticipant 행 수(일정별 참가자 합) */
      meta: {
        scheduleCount: number
        scheduleParticipantCount: number
      }
    }
  | {
      ok: false
      code:
        | "MISSING_RANGE"
        | "INCOMPLETE_FROM_TO"
        | "INVALID_FROM_TO"
        | "FROM_AFTER_TO"
        | "INVALID_YEAR_MONTH"
        | "INCOMPLETE_YEAR_MONTH"
        | "INVALID_PERIOD"
      message: string
    }

/** `2026-04` 또는 `2026년4월` 등 → 연·월. 실패 시 null */
export function parseCalendarPeriod(
  input: string | undefined,
): { year: number; month: number } | null {
  const s = input?.trim()
  if (!s) return null

  const ko = /^(\d{4})년\s*(\d{1,2})월\s*$/u.exec(s)
  if (ko) {
    const year = Number(ko[1])
    const month = Number(ko[2])
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month }
    }
    return null
  }

  const iso = /^(\d{4})-(\d{1,2})$/.exec(s)
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month }
    }
    return null
  }

  return null
}

/**
 * 일정 목록. 아래 중 하나 필수.
 * - `from` + `to` (ISO 8601, DB에서 `startTime` 구간 필터)
 * - `period` 한 개: `2026-04` 또는 `2026년4월` (로컬 타임존 해당 달 1일~말일)
 * - `year` + `month` (1~12, 위와 동일한 달 범위)
 *
 * 우선순위: `from`/`to` → `period` → `year`/`month`
 */
export async function listSchedules(
  q: ListSchedulesQuery,
): Promise<ListSchedulesResult> {
  const fromStr = q.from?.trim()
  const toStr = q.to?.trim()
  const hasFromTo = Boolean(fromStr && toStr)
  const y = toInt(q.year)
  const m = toInt(q.month)

  let fromDate: Date
  let toDate: Date

  if (hasFromTo) {
    const a = Date.parse(fromStr!)
    const b = Date.parse(toStr!)
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return {
        ok: false,
        code: "INVALID_FROM_TO",
        message: "from·to는 파싱 가능한 날짜 문자열이어야 합니다.",
      }
    }
    fromDate = new Date(a)
    toDate = new Date(b)
    if (fromDate.getTime() > toDate.getTime()) {
      return {
        ok: false,
        code: "FROM_AFTER_TO",
        message: "from이 to보다 늦을 수 없습니다.",
      }
    }
  } else if (fromStr || toStr) {
    return {
      ok: false,
      code: "INCOMPLETE_FROM_TO",
      message: "from과 to를 함께 보내야 합니다.",
    }
  } else if (q.period != null && String(q.period).trim().length > 0) {
    const parsed = parseCalendarPeriod(q.period)
    if (!parsed) {
      return {
        ok: false,
        code: "INVALID_PERIOD",
        message:
          "period는 YYYY-MM(예: 2026-04) 또는 YYYY년M월(예: 2026년4월) 형식이어야 합니다.",
      }
    }
    fromDate = new Date(parsed.year, parsed.month - 1, 1, 0, 0, 0, 0)
    toDate = new Date(parsed.year, parsed.month, 0, 23, 59, 59, 999)
  } else if (y != null && m != null) {
    if (y < 1900 || y > 2100 || m < 1 || m > 12) {
      return {
        ok: false,
        code: "INVALID_YEAR_MONTH",
        message: "year는 1900~2100, month는 1~12여야 합니다.",
      }
    }
    fromDate = new Date(y, m - 1, 1, 0, 0, 0, 0)
    toDate = new Date(y, m, 0, 23, 59, 59, 999)
  } else if (q.year != null && String(q.year).length > 0) {
    return {
      ok: false,
      code: "INCOMPLETE_YEAR_MONTH",
      message: "year와 month를 함께 보내야 합니다.",
    }
  } else if (q.month != null && String(q.month).length > 0) {
    return {
      ok: false,
      code: "INCOMPLETE_YEAR_MONTH",
      message: "year와 month를 함께 보내야 합니다.",
    }
  } else {
    return {
      ok: false,
      code: "MISSING_RANGE",
      message:
        "조회 구간이 필요합니다. 예: ?period=2026-05 또는 ?period=2026년5월, ?year=2026&month=5, from·to(ISO)",
    }
  }

  const rows = await db.query.schedules.findMany({
    where: (s, { and: a, gte: ge, lte: le }) =>
      a(ge(s.startTime, fromDate), le(s.startTime, toDate)),
    orderBy: (s, { asc: ascFn }) => [ascFn(s.startTime)],
    with: {
      game: true,
      /** ScheduleParticipant + Streamer */
      participants: { with: { streamer: true } },
    },
  })

  const scheduleParticipantCount = rows.reduce(
    (n, r) => n + (r.participants?.length ?? 0),
    0,
  )
  logSchedules("list", {
    schedules: rows.length,
    scheduleParticipants: scheduleParticipantCount,
    windowFrom: fromDate.toISOString(),
    windowTo: toDate.toISOString(),
  })

  const flat = flattenSchedules(rows.map(toScheduleRow))
  return {
    ok: true,
    schedules: flat,
    window: { from: fromDate.toISOString(), to: toDate.toISOString() },
    meta: {
      scheduleCount: rows.length,
      scheduleParticipantCount,
    },
  }
}

export async function getScheduleById(
  id: string,
): Promise<FlattenedSchedule | null> {
  const row = await db.query.schedules.findFirst({
    where: (s, { eq: eqFn }) => eqFn(s.id, id),
    with: {
      game: true,
      participants: { with: { streamer: true } },
    },
  })
  if (!row) {
    logSchedules("byId", { id, found: false, scheduleParticipants: 0 })
    return null
  }
  const pc = row.participants?.length ?? 0
  logSchedules("byId", { id, found: true, scheduleParticipants: pc })
  return flattenScheduleParticipants(toScheduleRow(row))
}
