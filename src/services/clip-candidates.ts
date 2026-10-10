import { createId } from "@paralleldrive/cuid2"
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm"
import { db, withDbRetry } from "../db"
import { clipCandidates, clips, streamers } from "../db/schema"
import { pgCode } from "../lib/pg-error"
import { logApi, logTrace } from "../lib/server-log"
import { createClip } from "./clips-mutations"

const MIN_READ_COUNT = 1000
const WINDOW_DAYS = 14
const MAX_NEW_PER_CHANNEL = 3
const PAGE_SIZE = 20
const MAX_PAGES = 4
const CHANNEL_CONCURRENCY = 3

const CHZZK_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Origin: "https://chzzk.naver.com",
  "front-client-platform-type": "PC",
  "front-client-product-type": "web",
}

export class ClipCandidateError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ClipCandidateError"
  }
}

export type ClipCandidateView = {
  id: string
  url: string
  title: string
  thumbnailUrl: string | null
  readCount: number
  streamerId: string
  streamerName: string
  clipDate: string | null
  lastSeenAt: string
}

type ClipListItem = {
  clipUID?: string
  clipTitle?: string
  thumbnailImageUrl?: string | null
  readCount?: number
  createdDate?: string
  adult?: boolean
  blindType?: string | null
}

function clipUrl(clipUid: string): string {
  return `https://chzzk.naver.com/clips/${clipUid}`
}

function extractChannelId(url: string): string | null {
  try {
    const { hostname, pathname } = new URL(url)
    if (!hostname.includes("chzzk.naver.com")) return null
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length === 0) return null
    const liveIdx = segments.indexOf("live")
    if (liveIdx >= 0) {
      const afterLive = segments[liveIdx + 1]
      if (afterLive && afterLive !== "chat") return afterLive
    }
    const last = segments[segments.length - 1]
    if (!last || last === "live" || last === "chat" || last === "clips") {
      return segments.length >= 2 ? segments[segments.length - 2] : null
    }
    return last
  } catch {
    return null
  }
}

function extractClipId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname !== "chzzk.naver.com") return null
    return u.pathname.match(/^\/clips\/([A-Za-z0-9_-]+)/)?.[1] ?? null
  } catch {
    return null
  }
}

function parseChzzkDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s)
    return Number.isFinite(d.getTime()) ? d : null
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+09:00`)
  return Number.isFinite(d.getTime()) ? d : null
}

async function mapPool<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      await fn(items[i]!)
    }
  })
  await Promise.all(workers)
}

async function fetchRecentPage(
  channelId: string,
  clipUID: string | null,
): Promise<{ items: ClipListItem[]; nextClipUID: string | null } | null> {
  const qs = new URLSearchParams({
    size: String(PAGE_SIZE),
    orderType: "RECENT",
  })
  if (clipUID) qs.set("clipUID", clipUID)
  const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}/clips?${qs}`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: CHZZK_HEADERS })
      if (!res.ok) {
        if (attempt === 0) continue
        return null
      }
      const json = (await res.json()) as {
        content?: {
          data?: ClipListItem[]
          page?: { next?: { clipUID?: string } | null }
        } | null
      }
      return {
        items: json.content?.data ?? [],
        nextClipUID: json.content?.page?.next?.clipUID?.trim() || null,
      }
    } catch {
      if (attempt === 0) continue
      return null
    }
  }
  return null
}

async function recentQualifyingClips(channelId: string, cutoff: Date): Promise<ClipListItem[]> {
  const hits: ClipListItem[] = []
  let cursor: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchRecentPage(channelId, cursor)
    if (!batch || batch.items.length === 0) break
    let passedWindow = false
    for (const item of batch.items) {
      if (!item.clipUID || item.adult || item.blindType) continue
      const created = parseChzzkDate(item.createdDate)
      if (!created || created < cutoff) {
        passedWindow = true
        break
      }
      if ((item.readCount ?? 0) >= MIN_READ_COUNT) hits.push(item)
    }
    if (passedWindow || !batch.nextClipUID) break
    cursor = batch.nextClipUID
  }

  hits.sort((a, b) => (b.readCount ?? 0) - (a.readCount ?? 0))
  return hits
}

function toView(row: typeof clipCandidates.$inferSelect): ClipCandidateView {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    thumbnailUrl: row.thumbnailUrl,
    readCount: row.readCount,
    streamerId: row.streamerId,
    streamerName: row.streamerName,
    clipDate: row.clipDate ? row.clipDate.toISOString() : null,
    lastSeenAt: row.lastSeenAt.toISOString(),
  }
}

export async function listPendingClipCandidates(limit = 40): Promise<ClipCandidateView[]> {
  const take = Math.min(80, Math.max(1, limit))
  const rows = await withDbRetry(() =>
    db
      .select()
      .from(clipCandidates)
      .where(eq(clipCandidates.status, "PENDING"))
      .orderBy(desc(clipCandidates.readCount), desc(clipCandidates.detectedAt))
      .limit(take),
  )
  return rows.map(toView)
}

export async function scanClipCandidates(now = new Date()) {
  logTrace("clipCandidates.scan")
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS)

  const purged = await withDbRetry(() =>
    db
      .delete(clipCandidates)
      .where(lt(clipCandidates.detectedAt, cutoff))
      .returning({ id: clipCandidates.id }),
  )

  const [memberRows, clipRows] = await Promise.all([
    withDbRetry(() =>
      db
        .select({
          id: streamers.id,
          name: streamers.name,
          chzzkUrl: streamers.chzzkUrl,
        })
        .from(streamers)
        .where(and(eq(streamers.isGuest, false))),
    ),
    withDbRetry(() => db.select({ url: clips.url }).from(clips)),
  ])

  const taken = new Set<string>()
  for (const row of clipRows) {
    const uid = extractClipId(row.url)
    if (uid) taken.add(uid)
  }

  let linkedExisting = 0
  if (taken.size > 0) {
    const linked = await db
      .update(clipCandidates)
      .set({ status: "APPROVED", resolvedAt: now })
      .where(
        and(
          eq(clipCandidates.status, "PENDING"),
          inArray(clipCandidates.clipUid, [...taken]),
        ),
      )
      .returning({ id: clipCandidates.id })
    linkedExisting = linked.length
  }

  const channels = memberRows.filter(
    (m) => m.chzzkUrl && extractChannelId(m.chzzkUrl),
  )
  let created = 0
  let refreshed = 0

  await mapPool(channels, CHANNEL_CONCURRENCY, async (member) => {
    const channelId = extractChannelId(member.chzzkUrl!)
    if (!channelId) return
    const hits = await recentQualifyingClips(channelId, cutoff)
    let added = 0

    for (const clip of hits) {
      const clipUid = clip.clipUID!
      if (taken.has(clipUid)) continue
      const title = clip.clipTitle?.trim() || `${member.name} 클립`
      const readCount = clip.readCount ?? 0
      const clipDate = parseChzzkDate(clip.createdDate)
      const existing = await db
        .select({ id: clipCandidates.id, status: clipCandidates.status })
        .from(clipCandidates)
        .where(eq(clipCandidates.clipUid, clipUid))
        .limit(1)

      const row = existing[0]
      if (row?.status === "APPROVED" || row?.status === "DISMISSED") continue

      if (row) {
        await db
          .update(clipCandidates)
          .set({
            title,
            thumbnailUrl: clip.thumbnailImageUrl?.trim() || null,
            readCount,
            streamerName: member.name,
            clipDate,
            lastSeenAt: now,
          })
          .where(eq(clipCandidates.id, row.id))
        refreshed += 1
        continue
      }

      if (added >= MAX_NEW_PER_CHANNEL) continue

      try {
        await db.insert(clipCandidates).values({
          id: createId(),
          clipUid,
          url: clipUrl(clipUid),
          title,
          thumbnailUrl: clip.thumbnailImageUrl?.trim() || null,
          readCount,
          streamerId: member.id,
          streamerName: member.name,
          clipDate,
          lastSeenAt: now,
          detectedAt: now,
        })
        added += 1
        created += 1
        taken.add(clipUid)
      } catch (error) {
        if (pgCode(error) !== "23505") throw error
      }
    }
  })

  const result = {
    channels: channels.length,
    created,
    refreshed,
    linkedExisting,
    purged: purged.length,
  }
  logApi("clipCandidates", { scan: true, ...result })
  return result
}

async function requirePending(id: string) {
  const rows = await db
    .select()
    .from(clipCandidates)
    .where(eq(clipCandidates.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) throw new ClipCandidateError("후보를 찾을 수 없습니다.", 404)
  if (row.status === "DISMISSED") {
    throw new ClipCandidateError("이미 거절된 후보입니다.", 409)
  }
  if (row.status === "APPROVED") {
    throw new ClipCandidateError("이미 등록된 후보입니다.", 409)
  }
  return row
}

export async function approveClipCandidate(id: string, title?: string) {
  logTrace("clipCandidates.approve", { id })
  const row = await requirePending(id)
  const nextTitle = title?.trim() || row.title
  const claimed = await db
    .update(clipCandidates)
    .set({ status: "APPROVED", resolvedAt: new Date(), title: nextTitle })
    .where(and(eq(clipCandidates.id, id), eq(clipCandidates.status, "PENDING")))
    .returning({ id: clipCandidates.id })
  if (claimed.length === 0) {
    throw new ClipCandidateError("이미 처리된 후보입니다.", 409)
  }

  try {
    const created = await createClip({
      title: nextTitle,
      url: row.url,
      streamerIds: [row.streamerId],
      thumbnailUrl: row.thumbnailUrl ?? undefined,
      clipDate: row.clipDate,
    })
    await db
      .update(clipCandidates)
      .set({ clipId: created.id })
      .where(eq(clipCandidates.id, id))
    logApi("clipCandidates", { approve: id, clipId: created.id })
    return { clipId: created.id }
  } catch (error) {
    await db
      .update(clipCandidates)
      .set({ status: "PENDING", resolvedAt: null })
      .where(and(eq(clipCandidates.id, id), isNull(clipCandidates.clipId)))
    throw error
  }
}

export async function dismissClipCandidate(id: string) {
  logTrace("clipCandidates.dismiss", { id })
  await requirePending(id)
  const updated = await db
    .update(clipCandidates)
    .set({ status: "DISMISSED", resolvedAt: new Date() })
    .where(and(eq(clipCandidates.id, id), eq(clipCandidates.status, "PENDING")))
    .returning({ id: clipCandidates.id })
  if (updated.length === 0) {
    throw new ClipCandidateError("이미 처리된 후보입니다.", 409)
  }
  logApi("clipCandidates", { dismiss: id })
}
