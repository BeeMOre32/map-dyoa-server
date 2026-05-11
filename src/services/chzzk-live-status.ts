import { db } from "../db"
import { logApi, logTrace } from "../lib/server-log"

const CHZZK_LIVE_DETAIL = "https://api.chzzk.naver.com/service/v2/channels"
const CACHE_TTL_MS = 60_000
const FETCH_TIMEOUT_MS = 4_000

type LiveCache = {
  liveStreamerIds: string[]
  fetchedAt: number
}

let cache: LiveCache | null = null
let inFlight: Promise<string[]> | null = null

function extractChannelId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    const parts = u.pathname.split("/").filter(Boolean)
    return parts[parts.length - 1] ?? null
  } catch {
    return null
  }
}

async function fetchLiveByChannelId(channelId: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${CHZZK_LIVE_DETAIL}/${channelId}/live-detail`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: controller.signal,
    })
    if (!res.ok) return false
    const json = (await res.json()) as { content?: { status?: string } }
    return json?.content?.status === "OPEN"
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function pullLiveStreamerIds(): Promise<string[]> {
  const streamers = await db.query.streamers.findMany({
    columns: { id: true, chzzkUrl: true },
    where: (s, { and, eq, isNotNull }) =>
      and(isNotNull(s.chzzkUrl), eq(s.isGuest, false)),
  })

  const rows = await Promise.all(
    streamers.map(async (s) => {
      const channelId = s.chzzkUrl ? extractChannelId(s.chzzkUrl) : null
      if (!channelId) return null
      const live = await fetchLiveByChannelId(channelId)
      return live ? s.id : null
    }),
  )

  return rows.filter((v): v is string => v !== null)
}

export async function getLiveStreamerIds(): Promise<string[]> {
  logTrace("chzzk.liveStatus")
  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.liveStreamerIds
  }

  if (inFlight) return inFlight

  inFlight = pullLiveStreamerIds()
    .then((ids) => {
      cache = { liveStreamerIds: ids, fetchedAt: Date.now() }
      logApi("chzzk-live", { count: ids.length, cached: false })
      return ids
    })
    .catch(() => {
      logApi("chzzk-live", { error: "FETCH_FAILED", stale: Boolean(cache) })
      return cache?.liveStreamerIds ?? []
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
