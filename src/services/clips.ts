import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import { db } from "../db"
import { clips } from "../db/schema"
import { logApi, logTrace } from "../lib/server-log"

export type ClipSortOption =
  | "newest"
  | "oldest"
  | "date_desc"
  | "date_asc"
  | "title"

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

/** 관계형 `findMany`의 `where(fields, …)` 첫 인자와 `clips` 테이블 공통으로 쓰는 컬럼만 */
type ClipFilterColumns = {
  id: typeof clips.id
  title: typeof clips.title
  clipDate: typeof clips.clipDate
  createdAt: typeof clips.createdAt
}

/**
 * 클립 목록 필터. 관계형 `findMany`의 `where` 콜백과 `select().from(clips).where(...)`에
 * 동일한 컬럼 참조를 씀 (`where: 미리 만든 SQL`은 내부 별칭과 맞지 않아 월 구간 등에서 실패할 수 있음).
 */
function clipFilterSQLForTable(
  opts: {
    streamerId?: string
    streamerIds?: string[]
    month?: string
    q?: string
  },
  t: ClipFilterColumns,
): SQL | undefined {
  const parts: SQL[] = []
  const ids =
    opts.streamerIds?.map((id) => id.trim()).filter(Boolean) ??
    (opts.streamerId?.trim() ? [opts.streamerId.trim()] : [])
  if (ids.length === 1) {
    parts.push(
      sql`${t.id} IN (SELECT "clipId" FROM "ClipParticipant" WHERE "streamerId" = ${ids[0]})`,
    )
  } else if (ids.length > 1) {
    parts.push(
      sql`${t.id} IN (SELECT "clipId" FROM "ClipParticipant" WHERE "streamerId" IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}))`,
    )
  }
  const month = opts.month?.trim()
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const y = Number(month.slice(0, 4))
    const m = Number(month.slice(5, 7))
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      // postgres.js: `gte(col, Date)` 바인딩 시 "Received an instance of Date" 오류가 날 수 있음.
      // timestamp 컬럼은 문자열을 gte 인자로 쓰면 Drizzle 드라이버 매핑이 깨지므로, ISO 문자열을 sql 파라미터로만 넘김.
      const startIso = new Date(y, m - 1, 1).toISOString()
      const endIso = new Date(y, m, 1).toISOString()
      parts.push(
        sql`(
          (${t.clipDate} is not null and ${t.clipDate} >= ${startIso}::timestamptz and ${t.clipDate} < ${endIso}::timestamptz)
          or
          (${t.clipDate} is null and ${t.createdAt} >= ${startIso}::timestamptz and ${t.createdAt} < ${endIso}::timestamptz)
        )`,
      )
    }
  }
  const q = opts.q?.trim()
  if (q) {
    const pat = `%${escapeLike(q)}%`
    parts.push(
      or(
        ilike(t.title, pat),
        sql`${t.id} IN (
          SELECT cp."clipId" FROM "ClipParticipant" cp
          INNER JOIN "Streamer" s ON s.id = cp."streamerId"
          WHERE s."name" ILIKE ${pat}
        )`,
      )!,
    )
  }
  if (parts.length === 0) return undefined
  return and(...parts)
}

export async function listClipsPaginated(args: {
  page?: number
  pageSize?: number
  streamerId?: string
  streamerIds?: string[]
  month?: string
  q?: string
  sort?: ClipSortOption
  /** true면 참가자·스트리머만 조인하고 일정·게임은 제외 (`scheduleId`는 유지) */
  clipsOnly?: boolean
}) {
  logTrace("clips.list", {
    page: args.page,
    streamerId: args.streamerId,
    month: args.month,
    clipsOnly: args.clipsOnly,
  })
  const page = Math.max(1, args.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 20))
  const sort: ClipSortOption = args.sort ?? "newest"
  const clipsOnly = Boolean(args.clipsOnly)
  const filterOpts = {
    streamerId: args.streamerId,
    streamerIds: args.streamerIds,
    month: args.month,
    q: args.q,
  }
  const wfSql = clipFilterSQLForTable(filterOpts, clips)
  const clipWhere =
    wfSql != null ? (c: ClipFilterColumns) => clipFilterSQLForTable(filterOpts, c)! : undefined

  const rows = clipsOnly
    ? await db.query.clips.findMany({
        ...(clipWhere ? { where: clipWhere } : {}),
        orderBy: (c, { asc: a, desc: d }) =>
          sort === "title"
            ? [a(c.title)]
            : sort === "oldest"
              ? [a(c.createdAt)]
              : sort === "date_desc"
                ? [d(c.clipDate), d(c.createdAt)]
                : sort === "date_asc"
                  ? [a(c.clipDate), a(c.createdAt)]
                  : [d(c.createdAt)],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        with: { participants: { with: { streamer: true } } },
      })
    : await db.query.clips.findMany({
        ...(clipWhere ? { where: clipWhere } : {}),
        orderBy: (c, { asc: a, desc: d }) =>
          sort === "title"
            ? [a(c.title)]
            : sort === "oldest"
              ? [a(c.createdAt)]
              : sort === "date_desc"
                ? [d(c.clipDate), d(c.createdAt)]
                : sort === "date_asc"
                  ? [a(c.clipDate), a(c.createdAt)]
                  : [d(c.createdAt)],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        with: {
          participants: { with: { streamer: true } },
          schedule: { with: { game: true } },
        },
      })

  const totalRow = wfSql
    ? await db.select({ c: count() }).from(clips).where(wfSql)
    : await db.select({ c: count() }).from(clips)

  const total = Number(totalRow[0]?.c ?? 0)
  logApi("clips", {
    list: true,
    clipsOnly,
    page,
    pageSize,
    returned: rows.length,
    total,
  })

  return {
    clips: rows,
    total,
    totalPages: Math.ceil(total / pageSize),
  }
}

/** 일정 상세용: 해당 `scheduleId` 클립만, 참가자 포함, 생성순 페이지네이션 */
export async function listClipsByScheduleIdPaginated(args: {
  scheduleId: string
  page?: number
  pageSize?: number
}) {
  logTrace("clips.bySchedule", { scheduleId: args.scheduleId, page: args.page })
  const sid = args.scheduleId?.trim()
  if (!sid) {
    logApi("clips", { byScheduleId: "", skipped: true })
    return { clips: [], total: 0, totalPages: 0 }
  }

  const page = Math.max(1, args.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 20))
  const wf = eq(clips.scheduleId, sid)

  const rows = await db.query.clips.findMany({
    where: (c, { eq: eqFn }) => eqFn(c.scheduleId, sid),
    orderBy: (c, { asc: a }) => [a(c.createdAt)],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    with: {
      participants: { with: { streamer: true } },
    },
  })

  const totalRow = await db.select({ c: count() }).from(clips).where(wf)
  const total = Number(totalRow[0]?.c ?? 0)
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)

  logApi("clips", {
    byScheduleId: sid,
    page,
    pageSize,
    returned: rows.length,
    total,
  })

  return { clips: rows, total, totalPages }
}

export async function getClipById(id: string) {
  logTrace("clips.byId", { id })
  const row = await db.query.clips.findFirst({
    where: (c, { eq: eqFn }) => eqFn(c.id, id),
    with: {
      participants: { with: { streamer: true } },
      schedule: { with: { game: true } },
    },
  })
  logApi("clips", { byId: id, found: Boolean(row) })
  return row ?? null
}

export async function getClipMonths(): Promise<string[]> {
  logTrace("clips.months")
  const rows = await db
    .select({
      clipDate: clips.clipDate,
      createdAt: clips.createdAt,
    })
    .from(clips)
    .orderBy(desc(clips.createdAt))

  const months = new Set<string>()
  for (const c of rows) {
    const d = new Date(c.clipDate ?? c.createdAt)
    if (!Number.isFinite(d.getTime())) continue
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  const list = Array.from(months).sort().reverse()
  logApi("clips", { months: list.length })
  return list
}
