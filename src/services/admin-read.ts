import { and, count, desc, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { clips, feedbacks, games, scheduleParticipants, schedules, streamers } from "../db/schema"
import { logApi, logTrace } from "../lib/server-log"

export async function getAdminStats() {
  logTrace("admin.stats")
  const [scheduleRows, clipRows, streamerRows, pendingRows] = await Promise.all([
    db.select({ c: count() }).from(schedules),
    db.select({ c: count() }).from(clips),
    db
      .select({ c: count() })
      .from(streamers)
      .where(eq(streamers.isGuest, false)),
    db
      .select({ c: count() })
      .from(feedbacks)
      .where(eq(feedbacks.status, "PENDING")),
  ])

  const stats = {
    scheduleCount: Number(scheduleRows[0]?.c ?? 0),
    clipCount: Number(clipRows[0]?.c ?? 0),
    streamerCount: Number(streamerRows[0]?.c ?? 0),
    pendingFeedbackCount: Number(pendingRows[0]?.c ?? 0),
  }
  logApi("admin", { stats: true, ...stats })
  return stats
}

export async function getAdminClips() {
  logTrace("admin.clips")
  const rows = await db.query.clips.findMany({
    orderBy: (c, { desc }) => [desc(c.createdAt)],
    with: {
      participants: {
        with: {
          streamer: {
            columns: { id: true, name: true, colorCode: true },
          },
        },
      },
    },
  })
  logApi("admin", { clips: rows.length })
  return rows
}

export async function getAdminSchedules(args?: { from?: string; to?: string }) {
  logTrace("admin.schedules", { from: args?.from, to: args?.to })
  const from = args?.from?.trim()
  const to = args?.to?.trim()
  const fromDate = from ? new Date(from) : null
  const toDate = to ? new Date(`${to}T23:59:59`) : null

  const rows = fromDate || toDate
    ? await db.query.schedules.findMany({
        where: (s, { and, gte, lte }) =>
          and(
            ...(fromDate ? [gte(s.startTime, fromDate)] : []),
            ...(toDate ? [lte(s.startTime, toDate)] : []),
          ),
        orderBy: (s, { desc }) => [desc(s.startTime)],
        with: {
          game: { columns: { id: true, title: true } },
          participants: {
            with: {
              streamer: { columns: { id: true, name: true, colorCode: true } },
            },
          },
        },
        limit: 200,
      })
    : await db.query.schedules.findMany({
        orderBy: (s, { desc }) => [desc(s.startTime)],
        with: {
          game: { columns: { id: true, title: true } },
          participants: {
            with: {
              streamer: { columns: { id: true, name: true, colorCode: true } },
            },
          },
        },
        limit: 200,
      })

  logApi("admin", { schedules: rows.length, ...(from ? { from } : {}), ...(to ? { to } : {}) })
  return rows
}

export async function getRecentActivity() {
  logTrace("admin.recentActivity")
  const [scheduleRows, clipRows] = await Promise.all([
    db.query.schedules.findMany({
      orderBy: (s, { desc }) => [desc(s.createdAt)],
      limit: 5,
      columns: { id: true, title: true, startTime: true, createdAt: true },
      with: { game: { columns: { title: true } } },
    }),
    db.query.clips.findMany({
      orderBy: (c, { desc }) => [desc(c.createdAt)],
      limit: 5,
      columns: { id: true, title: true, createdAt: true },
      with: {
        participants: {
          with: { streamer: { columns: { name: true } } },
        },
      },
    }),
  ])
  logApi("admin", { recentSchedules: scheduleRows.length, recentClips: clipRows.length })
  return { schedules: scheduleRows, clips: clipRows }
}

export async function getHoi4Leaderboard() {
  logTrace("admin.hoi4Leaderboard")
  const hoi4NaeJeonSchedules = await db
    .select({ id: schedules.id })
    .from(schedules)
    .innerJoin(games, eq(schedules.gameId, games.id))
    .where(and(eq(schedules.isNaeJeon, true), eq(games.isHoi4, true)))

  const scheduleIds = hoi4NaeJeonSchedules.map((r) => r.id)
  if (scheduleIds.length === 0) {
    logApi("admin", { hoi4Rows: 0, sessions: 0, leaderboard: 0 })
    return { leaderboard: [], sessions: [], totalSessions: 0 }
  }

  const rows = await db.query.scheduleParticipants.findMany({
    where: (sp, { and, eq }) => and(eq(sp.isGuest, false), inArray(sp.scheduleId, scheduleIds)),
    with: {
      streamer: { columns: { id: true, name: true, colorCode: true } },
      schedule: {
        columns: { id: true, title: true, startTime: true },
        with: { game: { columns: { title: true } } },
      },
    },
  })

  rows.sort(
    (a, b) =>
      new Date(b.schedule?.startTime ?? 0).getTime() -
      new Date(a.schedule?.startTime ?? 0).getTime(),
  )

  type StatEntry = {
    streamer: { id: string; name: string; colorCode: string }
    total: number
    nations: string[]
  }
  type SessionEntry = {
    id: string
    title: string
    startTime: Date | string
    game: { title: string } | null
    participants: { streamer: { id: string; name: string; colorCode: string }; nation: string | null }[]
  }

  const statsMap = new Map<string, StatEntry>()
  const sessionMap = new Map<string, SessionEntry>()

  for (const row of rows) {
    if (!row.streamer || !row.schedule) continue
    if (!statsMap.has(row.streamerId)) {
      statsMap.set(row.streamerId, { streamer: row.streamer, total: 0, nations: [] })
    }
    const stat = statsMap.get(row.streamerId)!
    stat.total++
    if (row.nation && !stat.nations.includes(row.nation)) stat.nations.push(row.nation)

    if (!sessionMap.has(row.scheduleId)) {
      sessionMap.set(row.scheduleId, {
        id: row.scheduleId,
        title: row.schedule.title,
        startTime: row.schedule.startTime,
        game: row.schedule.game ? { title: row.schedule.game.title } : null,
        participants: [],
      })
    }
    sessionMap.get(row.scheduleId)!.participants.push({
      streamer: row.streamer,
      nation: row.nation ?? null,
    })
  }

  const leaderboard = Array.from(statsMap.values()).sort((a, b) => b.total - a.total)
  const sessions = Array.from(sessionMap.values())
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 8)
    .map((s) => ({
      ...s,
      participants: [...s.participants].sort((a, b) =>
        a.streamer.name.localeCompare(b.streamer.name, "ko"),
      ),
    }))

  logApi("admin", { hoi4Rows: rows.length, sessions: sessions.length, leaderboard: leaderboard.length })
  return { leaderboard, sessions, totalSessions: sessionMap.size }
}
