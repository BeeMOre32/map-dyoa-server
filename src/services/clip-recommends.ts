import { createId } from "@paralleldrive/cuid2"
import { and, count, eq, inArray, sql } from "drizzle-orm"
import { db, withDbRetry } from "../db"
import { clipParticipants, clipRecommends, clips, streamers } from "../db/schema"
import { voterKey } from "../lib/clip-voter"
import { kstWeekStartIso } from "../lib/kst-week"

const CLIP_ID = /^[a-z0-9]{8,64}$/i

export type ClipWeekRecommendRow = {
  clipId: string
  recommends: number
  weekRecommends: number
  title: string
  url: string
  thumbnailUrl: string | null
  clipDate: string | null
  streamers: string[]
}

export type ToggleClipRecommendResult = {
  recommends: number
  recommended: boolean
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  if ((err as { code?: unknown }).code === "23505") return true
  return isUniqueViolation((err as { cause?: unknown }).cause)
}

export async function recommendCountsByClipId(
  ids: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return new Map()

  const rows = await withDbRetry(() =>
    db
      .select({
        clipId: clipRecommends.clipId,
        recommends: count(),
      })
      .from(clipRecommends)
      .where(inArray(clipRecommends.clipId, unique))
      .groupBy(clipRecommends.clipId),
  )

  return new Map(rows.map((row) => [row.clipId, Number(row.recommends)]))
}

async function countForClip(clipId: string): Promise<number> {
  const counts = await recommendCountsByClipId([clipId])
  return counts.get(clipId) ?? 0
}

export async function toggleClipRecommend(
  clipId: string,
  rawVoterId: string,
): Promise<ToggleClipRecommendResult | "BAD_VOTER" | "NOT_FOUND"> {
  const id = clipId.trim()
  if (!CLIP_ID.test(id)) return "NOT_FOUND"
  const key = voterKey(rawVoterId)
  if (!key) return "BAD_VOTER"

  const found = await withDbRetry(() =>
    db.select({ id: clips.id }).from(clips).where(eq(clips.id, id)).limit(1),
  )
  if (found.length === 0) return "NOT_FOUND"

  let recommended = false
  try {
    recommended = await withDbRetry(() =>
      db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: clipRecommends.id })
          .from(clipRecommends)
          .where(and(eq(clipRecommends.clipId, id), eq(clipRecommends.voterKey, key)))
          .limit(1)

        if (existing.length > 0) {
          await tx.delete(clipRecommends).where(eq(clipRecommends.id, existing[0].id))
          return false
        }

        await tx.insert(clipRecommends).values({
          id: createId(),
          clipId: id,
          voterKey: key,
        })
        return true
      }),
    )
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    recommended = true
  }

  return { recommends: await countForClip(id), recommended }
}

export async function listClipWeekRecommends(
  limit = 20,
): Promise<ClipWeekRecommendRow[]> {
  const take = Math.min(20, Math.max(1, Math.floor(limit)))
  const start = kstWeekStartIso()
  const ranked = await withDbRetry(() =>
    db.execute<{
      clipId: string
      recommends: number
      weekRecommends: number
    }>(sql`
      select "clipId",
             count(*)::int as "recommends",
             count(*) filter (where "createdAt" >= ${start}::timestamptz)::int as "weekRecommends"
      from "ClipRecommend"
      group by "clipId"
      having count(*) filter (where "createdAt" >= ${start}::timestamptz) > 0
      order by "recommends" desc, "weekRecommends" desc
      limit ${take}
    `),
  )

  const rankRows = [...ranked]
  if (rankRows.length === 0) return []

  const ids = rankRows.map((row) => row.clipId)
  const [details, people] = await Promise.all([
    withDbRetry(() =>
      db
        .select({
          clipId: clips.id,
          title: clips.title,
          url: clips.url,
          thumbnailUrl: clips.thumbnailUrl,
          clipDate: clips.clipDate,
          createdAt: clips.createdAt,
        })
        .from(clips)
        .where(inArray(clips.id, ids)),
    ),
    withDbRetry(() =>
      db
        .select({
          clipId: clipParticipants.clipId,
          name: streamers.name,
        })
        .from(clipParticipants)
        .innerJoin(streamers, eq(streamers.id, clipParticipants.streamerId))
        .where(inArray(clipParticipants.clipId, ids)),
    ),
  ])
  const byId = new Map(details.map((row) => [row.clipId, row]))
  const names = new Map<string, string[]>()
  for (const person of people) {
    const list = names.get(person.clipId) ?? []
    list.push(person.name)
    names.set(person.clipId, list)
  }

  return rankRows.flatMap((rank) => {
    const clip = byId.get(rank.clipId)
    if (!clip) return []
    const when = clip.clipDate ?? clip.createdAt
    return [
      {
        clipId: rank.clipId,
        recommends: Number(rank.recommends),
        weekRecommends: Number(rank.weekRecommends),
        title: clip.title,
        url: clip.url,
        thumbnailUrl: clip.thumbnailUrl,
        clipDate: when ? when.toISOString() : null,
        streamers: names.get(rank.clipId) ?? [],
      },
    ]
  })
}
