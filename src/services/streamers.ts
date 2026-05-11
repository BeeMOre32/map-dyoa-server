import { db } from "../db"
import { logApi, logTrace } from "../lib/server-log"

export async function listStreamers(opts?: { membersOnly?: boolean }) {
  logTrace("streamers.list", { membersOnly: opts?.membersOnly ?? false })
  const rows = await db.query.streamers.findMany({
    where: opts?.membersOnly
      ? (s, { eq: eqFn }) => eqFn(s.isGuest, false)
      : undefined,
    orderBy: (s, { asc: ascFn }) => [ascFn(s.name)],
  })
  logApi("streamers", { list: true, count: rows.length, membersOnly: opts?.membersOnly ?? false })
  return rows
}

export async function getStreamerById(id: string) {
  logTrace("streamers.byId", { id })
  const row = await db.query.streamers.findFirst({
    where: (s, { eq: eqFn }) => eqFn(s.id, id),
  })
  logApi("streamers", { byId: id, found: Boolean(row) })
  return row ?? null
}
