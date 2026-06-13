import { and, asc, desc, eq } from "drizzle-orm"
import { db, withDbRetry } from "../db"
import {
  auctionBids,
  auctionFactions,
  auctionNominees,
  auctionRooms,
  schedules,
} from "../db/schema"
import { broadcast } from "../realtime/auction-hub"
import { logTrace } from "../lib/server-log"

export type AuctionRole = "host" | "captain" | "viewer"

export type RoomRow = typeof auctionRooms.$inferSelect
export type FactionRow = typeof auctionFactions.$inferSelect
export type NomineeRow = typeof auctionNominees.$inferSelect

export type ScheduleSnippet = {
  id: string
  title: string
  startTime: string
}

export type RoomState = {
  room: {
    id: string
    code: string
    title: string
    status: string
    scheduleId: string | null
    minIncrement: number
    timerSeconds: number
    currentEndsAt: string | null
    currentNomineeId: string | null
  }
  schedule: ScheduleSnippet | null
  factions: Array<{
    id: string
    name: string
    colorCode: string
    orderIndex: number
    budgetTotal: number
    budgetRemaining: number
    roster: Array<{ nomineeId: string; name: string; nation: string | null; price: number }>
  }>
  nominees: Array<{
    id: string
    name: string
    nation: string | null
    imageUrl: string | null
    status: string
    orderIndex: number
    wonByFactionId: string | null
    finalPrice: number | null
  }>
  current: null | {
    nominee: { id: string; name: string; nation: string | null; imageUrl: string | null }
    highBid: { factionId: string; amount: number } | null
    bids: Array<{ factionId: string; amount: number; at: string }>
  }
}

export type AuctionRoomSummary = {
  id: string
  code: string
  title: string
  status: string
  scheduleId: string | null
  createdAt: string
}

/** 일정에 연결된 경매 방 목록(최신순, 최대 20) */
export async function listRoomsByScheduleId(
  scheduleId: string,
): Promise<AuctionRoomSummary[]> {
  const sid = scheduleId?.trim()
  if (!sid) return []

  const rows = await withDbRetry(() =>
    db
      .select({
        id: auctionRooms.id,
        code: auctionRooms.code,
        title: auctionRooms.title,
        status: auctionRooms.status,
        scheduleId: auctionRooms.scheduleId,
        createdAt: auctionRooms.createdAt,
      })
      .from(auctionRooms)
      .where(eq(auctionRooms.scheduleId, sid))
      .orderBy(desc(auctionRooms.createdAt))
      .limit(20),
  )

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    status: r.status,
    scheduleId: r.scheduleId,
    createdAt: r.createdAt.toISOString(),
  }))
}

async function getScheduleSnippet(
  scheduleId: string | null,
): Promise<ScheduleSnippet | null> {
  if (!scheduleId) return null
  const row = await withDbRetry(() =>
    db.query.schedules.findFirst({
      where: eq(schedules.id, scheduleId),
      columns: { id: true, title: true, startTime: true },
    }),
  )
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    startTime: row.startTime.toISOString(),
  }
}

export async function getRoomByCode(code: string): Promise<RoomRow | null> {
  const row = await withDbRetry(() =>
    db.query.auctionRooms.findFirst({
      where: (r, { eq }) => eq(r.code, code),
    }),
  )
  return row ?? null
}

export async function getFactionsByRoom(roomId: string): Promise<FactionRow[]> {
  return withDbRetry(() =>
    db
      .select()
      .from(auctionFactions)
      .where(eq(auctionFactions.roomId, roomId))
      .orderBy(asc(auctionFactions.orderIndex)),
  )
}

/** token으로 역할 식별: 방 hostToken이면 host, 세력 joinToken이면 captain, 아니면 viewer */
export function resolveRole(
  room: RoomRow,
  factions: FactionRow[],
  token: string | undefined | null,
): { role: AuctionRole; factionId: string | null } {
  const t = token?.trim()
  if (t && t === room.hostToken) return { role: "host", factionId: null }
  if (t) {
    const f = factions.find((x) => x.joinToken === t)
    if (f) return { role: "captain", factionId: f.id }
  }
  return { role: "viewer", factionId: null }
}

/** 특정 후보에 대한 현재 최고가 입찰 */
export async function getHighBid(
  nomineeId: string,
): Promise<{ factionId: string; amount: number } | null> {
  const rows = await withDbRetry(() =>
    db
      .select({
        factionId: auctionBids.factionId,
        amount: auctionBids.amount,
      })
      .from(auctionBids)
      .where(eq(auctionBids.nomineeId, nomineeId))
      .orderBy(desc(auctionBids.amount), asc(auctionBids.createdAt))
      .limit(1),
  )
  return rows[0] ?? null
}

/** 방 전체 상태 스냅샷(REST 조회 + WS 브로드캐스트 공용) */
export async function buildRoomState(room: RoomRow): Promise<RoomState> {
  const [factions, nominees, schedule] = await Promise.all([
    getFactionsByRoom(room.id),
    withDbRetry(() =>
      db
        .select()
        .from(auctionNominees)
        .where(eq(auctionNominees.roomId, room.id))
        .orderBy(asc(auctionNominees.orderIndex), asc(auctionNominees.createdAt)),
    ),
    getScheduleSnippet(room.scheduleId),
  ])

  const rosters = new Map<
    string,
    Array<{ nomineeId: string; name: string; nation: string | null; price: number }>
  >()
  for (const n of nominees) {
    if (n.status === "SOLD" && n.wonByFactionId) {
      const list = rosters.get(n.wonByFactionId) ?? []
      list.push({
        nomineeId: n.id,
        name: n.name,
        nation: n.nation,
        price: n.finalPrice ?? 0,
      })
      rosters.set(n.wonByFactionId, list)
    }
  }

  let current: RoomState["current"] = null
  if (room.currentNomineeId) {
    const nominee = nominees.find((n) => n.id === room.currentNomineeId)
    if (nominee) {
      const bidRows = await withDbRetry(() =>
        db
          .select({
            factionId: auctionBids.factionId,
            amount: auctionBids.amount,
            createdAt: auctionBids.createdAt,
          })
          .from(auctionBids)
          .where(
            and(
              eq(auctionBids.roomId, room.id),
              eq(auctionBids.nomineeId, nominee.id),
            ),
          )
          .orderBy(desc(auctionBids.createdAt))
          .limit(20),
      )
      const sorted = [...bidRows].sort((a, b) => b.amount - a.amount)
      const high = sorted[0] ?? null
      current = {
        nominee: {
          id: nominee.id,
          name: nominee.name,
          nation: nominee.nation,
          imageUrl: nominee.imageUrl,
        },
        highBid: high ? { factionId: high.factionId, amount: high.amount } : null,
        bids: bidRows.map((b) => ({
          factionId: b.factionId,
          amount: b.amount,
          at: b.createdAt.toISOString(),
        })),
      }
    }
  }

  return {
    room: {
      id: room.id,
      code: room.code,
      title: room.title,
      status: room.status,
      scheduleId: room.scheduleId,
      minIncrement: room.minIncrement,
      timerSeconds: room.timerSeconds,
      currentEndsAt: room.currentEndsAt ? room.currentEndsAt.toISOString() : null,
      currentNomineeId: room.currentNomineeId,
    },
    schedule,
    factions: factions.map((f) => ({
      id: f.id,
      name: f.name,
      colorCode: f.colorCode,
      orderIndex: f.orderIndex,
      budgetTotal: f.budgetTotal,
      budgetRemaining: f.budgetRemaining,
      roster: rosters.get(f.id) ?? [],
    })),
    nominees: nominees.map((n) => ({
      id: n.id,
      name: n.name,
      nation: n.nation,
      imageUrl: n.imageUrl,
      status: n.status,
      orderIndex: n.orderIndex,
      wonByFactionId: n.wonByFactionId,
      finalPrice: n.finalPrice,
    })),
    current,
  }
}

/** 최신 상태를 만들어 방의 모든 소켓에 푸시 */
export async function publishRoom(code: string): Promise<RoomState | null> {
  logTrace("auctions.publish", { code })
  const room = await getRoomByCode(code)
  if (!room) return null
  const state = await buildRoomState(room)
  broadcast(code, { type: "state", state })
  return state
}
