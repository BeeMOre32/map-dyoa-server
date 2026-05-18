import { db } from "../db"
import { logApi, logException, logTrace, logWarn } from "../lib/server-log"

const CHZZK_LIVE_DETAIL = "https://api.chzzk.naver.com/service/v2/channels"
const CACHE_TTL_MS = 60_000
const FETCH_TIMEOUT_MS = 4_000

type LiveCache = {
  liveStreamerIds: string[]
  fetchedAt: number
}

type ChannelProbe = "live" | "offline" | "error"

type PullStats = {
  memberCount: number
  withChannel: number
  invalidUrl: number
  live: number
  offline: number
  fetchError: number
  durationMs: number
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

async function fetchLiveByChannelId(channelId: string): Promise<ChannelProbe> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${CHZZK_LIVE_DETAIL}/${channelId}/live-detail`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: controller.signal,
    })
    if (!res.ok) return "error"
    const json = (await res.json()) as { content?: { status?: string } }
    return json?.content?.status === "OPEN" ? "live" : "offline"
  } catch {
    return "error"
  } finally {
    clearTimeout(timer)
  }
}

async function pullLiveStreamerIds(): Promise<{ ids: string[]; stats: PullStats }> {
  const started = Date.now()
  const streamers = await db.query.streamers.findMany({
    columns: { id: true, chzzkUrl: true },
    where: (s, { and, eq, isNotNull }) =>
      and(isNotNull(s.chzzkUrl), eq(s.isGuest, false)),
  })

  let withChannel = 0
  let invalidUrl = 0
  let live = 0
  let offline = 0
  let fetchError = 0

  const rows = await Promise.all(
    streamers.map(async (s) => {
      const channelId = s.chzzkUrl ? extractChannelId(s.chzzkUrl) : null
      if (!channelId) {
        invalidUrl += 1
        return null
      }
      withChannel += 1
      const probe = await fetchLiveByChannelId(channelId)
      if (probe === "live") {
        live += 1
        return s.id
      }
      if (probe === "offline") {
        offline += 1
        return null
      }
      fetchError += 1
      return null
    }),
  )

  const ids = rows.filter((v): v is string => v !== null)
  return {
    ids,
    stats: {
      memberCount: streamers.length,
      withChannel,
      invalidUrl,
      live,
      offline,
      fetchError,
      durationMs: Date.now() - started,
    },
  }
}

function logChzzkLive(
  outcome: "cache_hit" | "refreshed" | "fetch_failed",
  fields: Record<string, string | number | boolean | string[] | undefined>,
): void {
  logApi("chzzk-live", { type: "chzzk_live_poll", outcome, ...fields })
}

export async function getLiveStreamerIds(): Promise<string[]> {
  logTrace("chzzk.liveStatus")
  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.liveStreamerIds
  }

  if (inFlight) return inFlight

  inFlight = pullLiveStreamerIds()
    .then(({ ids, stats }) => {
      cache = { liveStreamerIds: ids, fetchedAt: Date.now() }
      logChzzkLive("refreshed", {
        cached: false,
        liveCount: ids.length,
        ...stats,
        liveStreamerIds: ids,
        cacheTtlMs: CACHE_TTL_MS,
        fetchTimeoutMs: FETCH_TIMEOUT_MS,
      })
      return ids
    })
    .catch((e) => {
      const staleIds = cache?.liveStreamerIds ?? []
      const cacheAgeMs = cache ? Date.now() - cache.fetchedAt : undefined
      logWarn("chzzk-live", {
        type: "chzzk_live_poll",
        outcome: "fetch_failed",
        error: "FETCH_FAILED",
        stale: Boolean(cache),
        staleLiveCount: staleIds.length,
        ...(cacheAgeMs !== undefined ? { staleCacheAgeMs: cacheAgeMs } : {}),
        ...(staleIds.length > 0 ? { liveStreamerIds: staleIds } : {}),
      })
      logException("chzzk.live_status_pull", e, { handled: true })
      return staleIds
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
