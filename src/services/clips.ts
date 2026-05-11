import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm"
import { db } from "../db"
import { clips } from "../db/schema"
import { logApi } from "../lib/server-log"

export type ClipSortOption =
  | "newest"
  | "oldest"
  | "date_desc"
  | "date_asc"
  | "title"

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

function clipFiltersSQL(opts: {
  streamerId?: string
  month?: string
  q?: string
}): SQL | undefined {
  const parts: SQL[] = []
  const sid = opts.streamerId?.trim()
  if (sid) {
    parts.push(
      sql`${clips.id} IN (SELECT "clipId" FROM "ClipParticipant" WHERE "streamerId" = ${sid})`,
    )
  }
  const month = opts.month?.trim()
  if (month) {
    const [y, m] = month.split("-").map(Number)
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 1)
      parts.push(
        or(
          and(sql`${clips.clipDate} >= ${start}`, sql`${clips.clipDate} < ${end}`),
          and(
            sql`${clips.clipDate} IS NULL`,
            sql`${clips.createdAt} >= ${start}`,
            sql`${clips.createdAt} < ${end}`,
          ),
        )!,
      )
    }
  }
  const q = opts.q?.trim()
  if (q) {
    const pat = `%${escapeLike(q)}%`
    parts.push(
      or(
        ilike(clips.title, pat),
        sql`${clips.id} IN (
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
  month?: string
  q?: string
  sort?: ClipSortOption
  /** true면 참가자·스트리머만 조인하고 일정·게임은 제외 (`scheduleId`는 유지) */
  clipsOnly?: boolean
}) {
  const page = Math.max(1, args.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 20))
  const sort: ClipSortOption = args.sort ?? "newest"
  const clipsOnly = Boolean(args.clipsOnly)
  const wf = clipFiltersSQL({
    streamerId: args.streamerId,
    month: args.month,
    q: args.q,
  })

  const rows = clipsOnly
    ? await db.query.clips.findMany({
        ...(wf ? { where: wf } : {}),
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
        ...(wf ? { where: wf } : {}),
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

  const totalRow = wf
    ? await db.select({ c: count() }).from(clips).where(wf)
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
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  const list = Array.from(months).sort().reverse()
  logApi("clips", { months: list.length })
  return list
}
