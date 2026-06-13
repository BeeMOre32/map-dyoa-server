import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { db, withDbRetry } from "../db"
import { auctionBids, auctionFactions, auctionNominees } from "../db/schema"
import { logTrace } from "../lib/server-log"
import { getFactionsByRoom, getRoomByCode } from "./auctions"

export type AuctionHistoryBidDto = {
  factionId: string
  factionName: string
  color: string
  amount: number
}

export type AuctionHistoryEntryDto = {
  nomineeId: string
  name: string
  nation: string | null
  kind: "sold" | "unsold"
  factionName?: string
  factionColor?: string
  winnerFactionId?: string
  finalPrice?: number
  bids: AuctionHistoryBidDto[]
  closedAt: string
}

export async function getAuctionHistoryByCode(
  code: string,
): Promise<{ entries: AuctionHistoryEntryDto[] } | null> {
  logTrace("auctions.history", { code })
  const room = await getRoomByCode(code)
  if (!room) return null

  const [nominees, factions] = await Promise.all([
    withDbRetry(() =>
      db
        .select()
        .from(auctionNominees)
        .where(
          and(
            eq(auctionNominees.roomId, room.id),
            inArray(auctionNominees.status, ["SOLD", "UNSOLD"]),
          ),
        ),
    ),
    getFactionsByRoom(room.id),
  ])

  if (nominees.length === 0) return { entries: [] }

  const factionById = new Map(factions.map((f) => [f.id, f]))
  const nomineeIds = nominees.map((n) => n.id)

  const bidRows = await withDbRetry(() =>
    db
      .select({
        nomineeId: auctionBids.nomineeId,
        factionId: auctionBids.factionId,
        amount: auctionBids.amount,
        createdAt: auctionBids.createdAt,
      })
      .from(auctionBids)
      .where(
        and(
          eq(auctionBids.roomId, room.id),
          inArray(auctionBids.nomineeId, nomineeIds),
        ),
      )
      .orderBy(desc(auctionBids.amount), asc(auctionBids.createdAt)),
  )

  const bidsByNominee = new Map<string, typeof bidRows>()
  for (const b of bidRows) {
    const list = bidsByNominee.get(b.nomineeId) ?? []
    list.push(b)
    bidsByNominee.set(b.nomineeId, list)
  }

  const entries: AuctionHistoryEntryDto[] = nominees.map((n) => {
    const raw = bidsByNominee.get(n.id) ?? []
    const maxPerFaction = new Map<string, number>()
    for (const b of raw) {
      const cur = maxPerFaction.get(b.factionId) ?? 0
      if (b.amount > cur) maxPerFaction.set(b.factionId, b.amount)
    }
    const bids: AuctionHistoryBidDto[] = [...maxPerFaction.entries()]
      .map(([factionId, amount]) => {
        const f = factionById.get(factionId)
        return {
          factionId,
          amount,
          factionName: f?.name ?? "—",
          color: f?.colorCode ?? "#6366f1",
        }
      })
      .sort((a, b) => b.amount - a.amount)

    const sold = n.status === "SOLD"
    const winner = n.wonByFactionId ? factionById.get(n.wonByFactionId) : undefined
    const lastBidAt = raw[0]?.createdAt

    return {
      nomineeId: n.id,
      name: n.name,
      nation: n.nation,
      kind: sold ? "sold" : "unsold",
      factionName: winner?.name,
      factionColor: winner?.colorCode,
      winnerFactionId: n.wonByFactionId ?? undefined,
      finalPrice: n.finalPrice ?? undefined,
      bids,
      closedAt: (lastBidAt ?? n.createdAt).toISOString(),
    }
  })

  entries.sort(
    (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime(),
  )

  return { entries }
}
