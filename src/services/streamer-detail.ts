import { and, count, eq, sql, type SQL } from "drizzle-orm"
import { db } from "../db"
import { clipParticipants, clips, scheduleParticipants, schedules } from "../db/schema"
import { logApi, logTrace } from "../lib/server-log"

function schedulesForStreamerWhere(streamerId: string): SQL {
  return sql`${schedules.id} IN (
    SELECT "scheduleId" FROM "ScheduleParticipant"
    WHERE "streamerId" = ${streamerId} AND "isGuest" = false
  )`
}

function clipsForStreamerWhere(streamerId: string): SQL {
  return sql`${clips.id} IN (
    SELECT "clipId" FROM "ClipParticipant" WHERE "streamerId" = ${streamerId}
  )`
}

/**
 * 스트리머 상세 패널용: 최근 일정·연결 클립·카운트 (Prisma `getStreamerDetail`과 동일 조건)
 */
export async function getStreamerDetailBundle(streamerId: string) {
  logTrace("streamer-detail.bundle", { streamerId })
  const sid = streamerId?.trim()
  if (!sid) {
    logApi("streamer-detail", { streamerId: "", skipped: true })
    return { schedules: [], linkedClips: [], scheduleCount: 0, clipCount: 0 }
  }

  const schWhere = schedulesForStreamerWhere(sid)
  const clipWhere = clipsForStreamerWhere(sid)

  const [scheduleList, linkedClipsRows, scheduleCountRow, clipCountRow] =
    await Promise.all([
      db.query.schedules.findMany({
        where: schWhere,
        orderBy: (s, { desc: d }) => [d(s.startTime)],
        limit: 20,
        with: {
          game: true,
          participants: { with: { streamer: true } },
        },
      }),
      db.query.clips.findMany({
        where: clipWhere,
        orderBy: (c, { desc: d }) => [d(c.createdAt)],
        limit: 8,
        with: {
          participants: { with: { streamer: true } },
          schedule: { with: { game: true } },
        },
      }),
      db
        .select({ c: count() })
        .from(scheduleParticipants)
        .where(
          and(
            eq(scheduleParticipants.streamerId, sid),
            eq(scheduleParticipants.isGuest, false),
          ),
        ),
      db
        .select({ c: count() })
        .from(clipParticipants)
        .where(eq(clipParticipants.streamerId, sid)),
    ])

  const scheduleCount = Number(scheduleCountRow[0]?.c ?? 0)
  const clipCount = Number(clipCountRow[0]?.c ?? 0)

  logApi("streamer-detail", {
    streamerId: sid,
    schedules: scheduleList.length,
    linkedClips: linkedClipsRows.length,
    scheduleCount,
    clipCount,
  })

  return {
    schedules: scheduleList,
    linkedClips: linkedClipsRows,
    scheduleCount,
    clipCount,
  }
}
