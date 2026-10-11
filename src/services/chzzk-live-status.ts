import { db } from "../db"
import { logApi, logException, logTrace, logWarn } from "../lib/server-log"

const CHZZK_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Origin: "https://chzzk.naver.com",
  "front-client-platform-type": "PC",
  "front-client-product-type": "web",
}

/** live-detail보다 가볍다. polling v1은 500을 반환한다. */
const LIVE_STATUS_URL = (channelId: string) =>
  `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`
const LIVE_DETAIL_URL = (channelId: string) =>
  `https://api.chzzk.naver.com/service/v2/channels/${channelId}/live-detail`

/** Next 서버 스냅샷과 같은 간격. 더 길면 끝난 방송이 LIVE로 남는다. */
const CACHE_TTL_MS = 30_000
const FETCH_TIMEOUT_MS = 4_000
const POLL_CONCURRENCY = 6

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
  detailFallback: number
  durationMs: number
}

let cache: LiveCache | null = null
let inFlight: Promise<string[]> | null = null

/** `/id`, `/live/id`, `/live/id/chat` */
function extractChannelId(rawUrl: string): string | null {
  try {
    const { hostname, pathname } = new URL(rawUrl)
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

async function fetchOpenFlag(url: string): Promise<{ ok: true; open: boolean } | { ok: false }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: CHZZK_HEADERS,
      cache: "no-store",
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false }
    const json = (await res.json()) as { content?: { status?: string } | null }
    return { ok: true, open: json.content?.status === "OPEN" }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

async function probeChannel(channelId: string): Promise<{ probe: ChannelProbe; usedDetail: boolean }> {
  const polled = await fetchOpenFlag(LIVE_STATUS_URL(channelId))
  if (polled.ok) return { probe: polled.open ? "live" : "offline", usedDetail: false }

  const detail = await fetchOpenFlag(LIVE_DETAIL_URL(channelId))
  if (!detail.ok) return { probe: "error", usedDetail: true }
  return { probe: detail.open ? "live" : "offline", usedDetail: true }
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      results[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return results
}

async function pullLiveStreamerIds(): Promise<{ ids: string[]; stats: PullStats }> {
  const started = Date.now()
  const streamers = await db.query.streamers.findMany({
    columns: { id: true, chzzkUrl: true },
    where: (s, { and, eq, isNotNull }) => and(isNotNull(s.chzzkUrl), eq(s.isGuest, false)),
  })

  const targets: { id: string; channelId: string }[] = []
  let invalidUrl = 0
  for (const s of streamers) {
    const channelId = s.chzzkUrl ? extractChannelId(s.chzzkUrl) : null
    if (!channelId) {
      invalidUrl += 1
      continue
    }
    targets.push({ id: s.id, channelId })
  }

  const probed = await mapPool(targets, POLL_CONCURRENCY, async (row) => {
    const result = await probeChannel(row.channelId)
    return { id: row.id, ...result }
  })

  let live = 0
  let offline = 0
  let fetchError = 0
  let detailFallback = 0
  const ids: string[] = []
  for (const row of probed) {
    if (row.usedDetail) detailFallback += 1
    if (row.probe === "live") {
      live += 1
      ids.push(row.id)
    } else if (row.probe === "offline") {
      offline += 1
    } else {
      fetchError += 1
    }
  }

  return {
    ids,
    stats: {
      memberCount: streamers.length,
      withChannel: targets.length,
      invalidUrl,
      live,
      offline,
      fetchError,
      detailFallback,
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
