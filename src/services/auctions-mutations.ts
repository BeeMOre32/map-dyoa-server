import { createId } from "@paralleldrive/cuid2"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { db, withDbRetry } from "../db"
import {
  auctionBids,
  auctionFactions,
  auctionNominees,
  auctionRooms,
  schedules,
} from "../db/schema"
import { logApi, logTrace } from "../lib/server-log"
import {
  clearRoomTimer,
  scheduleRoomClose,
} from "../realtime/auction-timer"
import { getHighBid, getRoomByCode, publishRoom } from "./auctions"

const factionInputSchema = z.object({
  name: z.string().min(1).max(40),
  colorCode: z.string().min(1).max(20).optional(),
  budget: z.number().int().min(1).max(1_000_000).optional(),
})

const nomineeInputSchema = z.object({
  name: z.string().min(1).max(60),
  nation: z.string().max(40).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  streamerId: z.string().max(64).optional().nullable(),
})

const createRoomSchema = z.object({
  title: z.string().min(1).max(80),
  minIncrement: z.number().int().min(1).max(100_000).optional(),
  timerSeconds: z.number().int().min(0).max(3600).optional(),
  scheduleId: z.string().max(64).optional().nullable(),
  factions: z.array(factionInputSchema).min(2).max(6),
  nominees: z.array(nomineeInputSchema).min(1).max(300),
})

export type CreateRoomResult = {
  roomId: string
  code: string
  hostToken: string
  factions: Array<{
    id: string
    name: string
    colorCode: string
    orderIndex: number
    joinToken: string
  }>
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

function randomCode(len = 6): string {
  let out = ""
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

async function uniqueRoomCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = randomCode()
    const existing = await getRoomByCode(code)
    if (!existing) return code
  }
  // 극히 드문 충돌: 길이를 늘려 재시도
  return randomCode(8)
}

export async function createRoom(raw: unknown): Promise<CreateRoomResult> {
  logTrace("auctions.create")
  const v = createRoomSchema.parse(raw)

  const roomId = createId()
  const code = await uniqueRoomCode()
  const hostToken = createId()
  const minIncrement = v.minIncrement ?? 10
  const timerSeconds = v.timerSeconds ?? 0
  const scheduleId = v.scheduleId?.trim() || null

  if (scheduleId) {
    const schedule = await withDbRetry(() =>
      db.query.schedules.findFirst({
        where: eq(schedules.id, scheduleId),
        columns: { id: true },
      }),
    )
    if (!schedule) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["scheduleId"],
          message: "존재하지 않는 일정입니다.",
        },
      ])
    }
  }

  const factionRows = v.factions.map((f, i) => ({
    id: createId(),
    roomId,
    name: f.name.trim(),
    colorCode: f.colorCode?.trim() || "#673AB7",
    joinToken: createId(),
    budgetTotal: f.budget ?? 1000,
    budgetRemaining: f.budget ?? 1000,
    orderIndex: i + 1,
  }))

  const nomineeRows = v.nominees.map((n, i) => ({
    id: createId(),
    roomId,
    name: n.name.trim(),
    nation: n.nation?.trim() || null,
    imageUrl: n.imageUrl?.trim() || null,
    streamerId: n.streamerId?.trim() || null,
    status: "WAITING" as const,
    orderIndex: i,
  }))

  await db.transaction(async (tx) => {
    await tx.insert(auctionRooms).values({
      id: roomId,
      code,
      title: v.title.trim(),
      status: "LOBBY",
      scheduleId,
      minIncrement,
      timerSeconds,
      hostToken,
    })
    await tx.insert(auctionFactions).values(factionRows)
    await tx.insert(auctionNominees).values(nomineeRows)
  })

  logApi("auctions", { create: roomId, code, factions: factionRows.length, nominees: nomineeRows.length })

  return {
    roomId,
    code,
    hostToken,
    factions: factionRows.map((f) => ({
      id: f.id,
      name: f.name,
      colorCode: f.colorCode,
      orderIndex: f.orderIndex,
      joinToken: f.joinToken,
    })),
  }
}

export type ControlResult =
  | { ok: true }
  | { ok: false; reason: string }

/** 호스트: 후보를 경매대에 올림(이전 미낙찰 후보는 대기로 되돌리고 해당 후보 입찰 초기화) */
export async function nominate(code: string, nomineeId: string): Promise<ControlResult> {
  logTrace("auctions.nominate", { code, nomineeId })
  const room = await getRoomByCode(code)
  if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" }
  if (room.status !== "LIVE") return { ok: false, reason: "NOT_LIVE" }

  const nominee = await withDbRetry(() =>
    db.query.auctionNominees.findFirst({
      where: (n, { eq, and }) => and(eq(n.id, nomineeId), eq(n.roomId, room.id)),
    }),
  )
  if (!nominee) return { ok: false, reason: "NOMINEE_NOT_FOUND" }
  if (nominee.status === "SOLD") return { ok: false, reason: "ALREADY_SOLD" }

  await db.transaction(async (tx) => {
    // 직전에 올라있던(미낙찰) 후보는 대기로 되돌림
    if (room.currentNomineeId && room.currentNomineeId !== nomineeId) {
      await tx
        .update(auctionNominees)
        .set({ status: "WAITING" })
        .where(
          and(
            eq(auctionNominees.id, room.currentNomineeId),
            eq(auctionNominees.status, "ON_BLOCK"),
          ),
        )
    }
    // 새 후보의 기존 입찰 초기화 후 경매대에 올림
    await tx.delete(auctionBids).where(eq(auctionBids.nomineeId, nomineeId))
    await tx
      .update(auctionNominees)
      .set({ status: "ON_BLOCK", wonByFactionId: null, finalPrice: null })
      .where(eq(auctionNominees.id, nomineeId))
    await tx
      .update(auctionRooms)
      .set({ currentNomineeId: nomineeId, currentEndsAt: null, updatedAt: new Date() })
      .where(eq(auctionRooms.id, room.id))
  })

  clearRoomTimer(code)

  logApi("auctions", { nominate: nomineeId, code })
  return { ok: true }
}

/** 호스트: 현재 LOT 입찰 타이머 시작 */
export async function startLot(code: string): Promise<ControlResult> {
  logTrace("auctions.startLot", { code })
  const room = await getRoomByCode(code)
  if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" }
  if (room.status !== "LIVE") return { ok: false, reason: "NOT_LIVE" }
  if (!room.currentNomineeId) return { ok: false, reason: "NO_NOMINEE" }
  if (room.timerSeconds <= 0) return { ok: true }

  const endsAt = new Date(Date.now() + room.timerSeconds * 1000)
  await db
    .update(auctionRooms)
    .set({ currentEndsAt: endsAt, updatedAt: new Date() })
    .where(eq(auctionRooms.id, room.id))

  scheduleRoomClose(code, room.timerSeconds * 1000)
  logApi("auctions", { startLot: room.currentNomineeId, code })
  return { ok: true }
}

/** 캡틴: 현재 경매대 후보에 호가 */
export async function placeBid(
  code: string,
  factionId: string,
  amount: number,
): Promise<ControlResult> {
  logTrace("auctions.bid", { code, factionId, amount })
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "INVALID_AMOUNT" }

  const room = await getRoomByCode(code)
  if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" }
  if (room.status !== "LIVE") return { ok: false, reason: "NOT_LIVE" }
  if (!room.currentNomineeId) return { ok: false, reason: "NO_NOMINEE" }
  if (room.timerSeconds > 0 && !room.currentEndsAt) {
    return { ok: false, reason: "BIDDING_NOT_OPEN" }
  }

  const [faction, nominee] = await Promise.all([
    withDbRetry(() =>
      db.query.auctionFactions.findFirst({
        where: (f, { eq, and }) => and(eq(f.id, factionId), eq(f.roomId, room.id)),
      }),
    ),
    withDbRetry(() =>
      db.query.auctionNominees.findFirst({
        where: (n, { eq }) => eq(n.id, room.currentNomineeId as string),
      }),
    ),
  ])

  if (!faction) return { ok: false, reason: "FACTION_NOT_FOUND" }
  if (!nominee || nominee.status !== "ON_BLOCK") return { ok: false, reason: "NOMINEE_NOT_ON_BLOCK" }
  if (amount > faction.budgetRemaining) return { ok: false, reason: "OVER_BUDGET" }

  const high = await getHighBid(nominee.id)
  const minRequired = high ? high.amount + room.minIncrement : room.minIncrement
  if (amount < minRequired) return { ok: false, reason: "TOO_LOW" }
  if (high && high.factionId === factionId) return { ok: false, reason: "ALREADY_HIGH" }

  await db.insert(auctionBids).values({
    id: createId(),
    roomId: room.id,
    nomineeId: nominee.id,
    factionId,
    amount,
  })

  // 안티 스나이프: 호가가 들어오면 마감 시각을 다시 연장
  if (room.timerSeconds > 0) {
    const endsAt = new Date(Date.now() + room.timerSeconds * 1000)
    await db
      .update(auctionRooms)
      .set({ currentEndsAt: endsAt })
      .where(eq(auctionRooms.id, room.id))
    scheduleRoomClose(code, room.timerSeconds * 1000)
  }

  logApi("auctions", { bid: nominee.id, factionId, amount, code })
  return { ok: true }
}

/** 호스트: 낙찰 — 최고가 세력에 배정하고 예산 차감 */
export async function markSold(code: string): Promise<ControlResult> {
  logTrace("auctions.sold", { code })
  const room = await getRoomByCode(code)
  if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" }
  if (!room.currentNomineeId) return { ok: false, reason: "NO_NOMINEE" }

  const high = await getHighBid(room.currentNomineeId)
  if (!high) return { ok: false, reason: "NO_BIDS" }

  await db.transaction(async (tx) => {
    await tx
      .update(auctionNominees)
      .set({ status: "SOLD", wonByFactionId: high.factionId, finalPrice: high.amount })
      .where(eq(auctionNominees.id, room.currentNomineeId as string))
    const f = await tx.query.auctionFactions.findFirst({
      where: (x, { eq }) => eq(x.id, high.factionId),
    })
    if (f) {
      await tx
        .update(auctionFactions)
        .set({ budgetRemaining: Math.max(0, f.budgetRemaining - high.amount) })
        .where(eq(auctionFactions.id, high.factionId))
    }
    await tx
      .update(auctionRooms)
      .set({ currentNomineeId: null, currentEndsAt: null, updatedAt: new Date() })
      .where(eq(auctionRooms.id, room.id))
  })

  clearRoomTimer(code)
  logApi("auctions", { sold: room.currentNomineeId, factionId: high.factionId, price: high.amount, code })
  return { ok: true }
}

/** 호스트: 유찰 */
export async function markUnsold(code: string): Promise<ControlResult> {
  logTrace("auctions.unsold", { code })
  const room = await getRoomByCode(code)
  if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" }
  if (!room.currentNomineeId) return { ok: false, reason: "NO_NOMINEE" }

  await db.transaction(async (tx) => {
    await tx
      .update(auctionNominees)
      .set({ status: "UNSOLD" })
      .where(eq(auctionNominees.id, room.currentNomineeId as string))
    await tx
      .update(auctionRooms)
      .set({ currentNomineeId: null, currentEndsAt: null, updatedAt: new Date() })
      .where(eq(auctionRooms.id, room.id))
  })

  clearRoomTimer(code)
  logApi("auctions", { unsold: room.currentNomineeId, code })
  return { ok: true }
}

/** 호스트: 직전 낙찰 1건 되돌리기(예산 환급, 후보를 대기로) */
export async function undoLastSold(code: string): Promise<ControlResult> {
  logTrace("auctions.undo", { code })
  const room = await getRoomByCode(code)
  if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" }

  // SOLD 후보 중 "가장 최근에 낙찰된" 것을 낙찰가 입찰의 시점 기준으로 고른다.
  const soldNominees = await withDbRetry(() =>
    db
      .select()
      .from(auctionNominees)
      .where(and(eq(auctionNominees.roomId, room.id), eq(auctionNominees.status, "SOLD"))),
  )
  if (soldNominees.length === 0) return { ok: false, reason: "NOTHING_TO_UNDO" }

  let target: (typeof soldNominees)[number] | null = null
  let targetAt = -Infinity
  for (const n of soldNominees) {
    const winRows = await withDbRetry(() =>
      db
        .select({ createdAt: auctionBids.createdAt })
        .from(auctionBids)
        .where(
          and(
            eq(auctionBids.nomineeId, n.id),
            eq(auctionBids.factionId, n.wonByFactionId as string),
            eq(auctionBids.amount, n.finalPrice ?? 0),
          ),
        )
        .orderBy(desc(auctionBids.createdAt))
        .limit(1),
    )
    const at = winRows[0]?.createdAt?.getTime() ?? 0
    if (at >= targetAt) {
      targetAt = at
      target = n
    }
  }
  if (!target || !target.wonByFactionId) return { ok: false, reason: "NOTHING_TO_UNDO" }

  await db.transaction(async (tx) => {
    const f = await tx.query.auctionFactions.findFirst({
      where: (x, { eq }) => eq(x.id, target.wonByFactionId as string),
    })
    if (f) {
      await tx
        .update(auctionFactions)
        .set({ budgetRemaining: f.budgetRemaining + (target.finalPrice ?? 0) })
        .where(eq(auctionFactions.id, f.id))
    }
    await tx
      .update(auctionNominees)
      .set({ status: "WAITING", wonByFactionId: null, finalPrice: null })
      .where(eq(auctionNominees.id, target.id))
  })

  logApi("auctions", { undo: target.id, code })
  return { ok: true }
}

const STATUS_VALUES = new Set(["LOBBY", "LIVE", "PAUSED", "ENDED"])

/** 호스트: 방 상태 전환 */
export async function setRoomStatus(code: string, status: string): Promise<ControlResult> {
  logTrace("auctions.status", { code, status })
  if (!STATUS_VALUES.has(status)) return { ok: false, reason: "INVALID_STATUS" }
  const room = await getRoomByCode(code)
  if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" }

  // LIVE가 아니게 되면 진행 중 라운드 타이머를 멈춘다
  if (status !== "LIVE") {
    clearRoomTimer(code)
    await db
      .update(auctionRooms)
      .set({ status, currentEndsAt: null, updatedAt: new Date() })
      .where(eq(auctionRooms.id, room.id))
  } else {
    await db
      .update(auctionRooms)
      .set({ status, updatedAt: new Date() })
      .where(eq(auctionRooms.id, room.id))
  }

  logApi("auctions", { status, code })
  return { ok: true }
}

/** 호스트: 대기·유찰·진행 중 명단 순서 변경 (낙찰 SOLD 제외) */
export async function reorderNominees(
  code: string,
  nomineeIds: string[],
): Promise<ControlResult> {
  logTrace("auctions.reorder", { code, count: nomineeIds.length })
  const room = await getRoomByCode(code)
  if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" }

  const nominees = await withDbRetry(() =>
    db.query.auctionNominees.findMany({
      where: eq(auctionNominees.roomId, room.id),
    }),
  )
  const reorderable = nominees.filter((n) => n.status !== "SOLD")
  const expected = new Set(reorderable.map((n) => n.id))
  if (
    expected.size !== nomineeIds.length ||
    nomineeIds.some((id) => !expected.has(id))
  ) {
    return { ok: false, reason: "INVALID_ORDER" }
  }

  const sold = nominees
    .filter((n) => n.status === "SOLD")
    .sort((a, b) => a.orderIndex - b.orderIndex)

  await db.transaction(async (tx) => {
    for (let i = 0; i < nomineeIds.length; i++) {
      await tx
        .update(auctionNominees)
        .set({ orderIndex: i })
        .where(eq(auctionNominees.id, nomineeIds[i]!))
    }
    for (let j = 0; j < sold.length; j++) {
      await tx
        .update(auctionNominees)
        .set({ orderIndex: nomineeIds.length + j })
        .where(eq(auctionNominees.id, sold[j]!.id))
    }
  })

  logApi("auctions", { reorder: nomineeIds.length, code })
  return { ok: true }
}

/** 호스트: 현재 라운드의 마지막 입찰 1건 취소(오클릭 복구용) */
export async function undoLastBid(code: string): Promise<ControlResult> {
  logTrace("auctions.undoBid", { code })
  const room = await getRoomByCode(code)
  if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" }
  if (!room.currentNomineeId) return { ok: false, reason: "NO_NOMINEE" }

  const last = await withDbRetry(() =>
    db
      .select({ id: auctionBids.id })
      .from(auctionBids)
      .where(
        and(
          eq(auctionBids.roomId, room.id),
          eq(auctionBids.nomineeId, room.currentNomineeId as string),
        ),
      )
      .orderBy(desc(auctionBids.createdAt))
      .limit(1),
  )
  if (last.length === 0) return { ok: false, reason: "NO_BIDS" }

  await db.delete(auctionBids).where(eq(auctionBids.id, last[0].id))
  logApi("auctions", { undoBid: last[0].id, code })
  return { ok: true }
}

/** 타이머 만료 시 자동 처리: 입찰이 있으면 낙찰, 없으면 유찰 */
export async function autoResolveExpired(code: string): Promise<void> {
  logTrace("auctions.autoResolve", { code })
  const room = await getRoomByCode(code)
  if (!room || room.status !== "LIVE" || !room.currentNomineeId) {
    clearRoomTimer(code)
    return
  }
  const high = await getHighBid(room.currentNomineeId)
  if (high) await markSold(code)
  else await markUnsold(code)
  await publishRoom(code)
}
