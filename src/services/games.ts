import { sql } from "drizzle-orm"
import { db } from "../db"
import { games } from "../db/schema"
import { logApi, logTrace } from "../lib/server-log"

export async function listGamesWithScheduleCount() {
  logTrace("games.list")
  const rows = await db
    .select({
      id: games.id,
      title: games.title,
      isHoi4: games.isHoi4,
      scheduleCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM "Schedule" s
        WHERE s."gameId" = ${games.id}
      )`,
    })
    .from(games)
    .orderBy(games.title)

  logApi("games", { list: true, count: rows.length })
  return rows.map((g) => ({
    id: g.id,
    title: g.title,
    isHoi4: g.isHoi4,
    _count: { schedules: Number(g.scheduleCount ?? 0) },
  }))
}

export async function getGameById(id: string) {
  logTrace("games.byId", { id })
  const row = await db.query.games.findFirst({
    where: (g, { eq }) => eq(g.id, id),
  })
  logApi("games", { byId: id, found: Boolean(row) })
  return row ?? null
}
