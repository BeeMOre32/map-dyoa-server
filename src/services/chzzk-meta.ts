import { db } from "../db"
import { logApi, logTrace, logWarn } from "../lib/server-log"

const CHZZK_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Origin: "https://chzzk.naver.com",
  "front-client-platform-type": "PC",
  "front-client-product-type": "web",
}

const LIVE_DETAIL_TIMEOUT_MS = 6_000
const LIVE_DETAIL_RETRIES = 2

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 치지직 채널 ID — `/id`, `/live/id`, `/live/id/chat` 등 */
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

function extractChzzkClipId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname !== "chzzk.naver.com") return null
    const match = u.pathname.match(/^\/clips\/([A-Za-z0-9_-]+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function findCoverUrl(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findCoverUrl(item)
      if (found) return found
    }
    return null
  }
  const record = obj as Record<string, unknown>
  if ("cover" in record && Array.isArray(record.cover) && record.cover.length > 0) {
    const first = record.cover[0] as Record<string, unknown>
    if (typeof first?.value === "string" && first.value.startsWith("http")) {
      return first.value
    }
  }
  for (const val of Object.values(record)) {
    const found = findCoverUrl(val)
    if (found) return found
  }
  return null
}

const LIVE_META_CACHE_MS = 30_000
const CLIP_META_CACHE_MS = 60 * 60 * 1000
const CLIP_FETCH_TIMEOUT_MS = 8_000

type LiveMetaContent = {
  status?: string
  liveTitle?: string
  liveCategory?: string
  liveCategoryValue?: string
  concurrentUserCount?: number
  liveImageUrl?: string | null
  defaultThumbnailImageUrl?: string | null
  channel?: { channelName?: string }
}

type LiveDetailResult = { content: LiveMetaContent | null; upstreamStatus: number | null }

const liveDetailCache = new Map<string, { at: number; value: LiveDetailResult }>()
const liveDetailInflight = new Map<string, Promise<LiveDetailResult>>()

type ClipMetaData = { thumbnailUrl: string | null; title: string }
const clipMetaCache = new Map<string, { at: number; data: ClipMetaData }>()
const clipMetaInflight = new Map<string, Promise<ClipMetaData | null>>()

async function fetchLiveDetailContent(
  channelId: string,
): Promise<{ content: LiveMetaContent | null; upstreamStatus: number | null }> {
  let lastStatus: number | null = null

  for (let attempt = 0; attempt <= LIVE_DETAIL_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), LIVE_DETAIL_TIMEOUT_MS)
    try {
      const liveRes = await fetch(
        `https://api.chzzk.naver.com/service/v2/channels/${channelId}/live-detail`,
        {
          headers: CHZZK_HEADERS,
          cache: "no-store",
          signal: controller.signal,
        },
      )
      lastStatus = liveRes.status
      if (!liveRes.ok) {
        if (attempt < LIVE_DETAIL_RETRIES) {
          await sleep(250 * 2 ** attempt)
          continue
        }
        return { content: null, upstreamStatus: lastStatus }
      }
      const json = (await liveRes.json()) as { content?: LiveMetaContent | null }
      return { content: json.content ?? null, upstreamStatus: lastStatus }
    } catch {
      if (attempt < LIVE_DETAIL_RETRIES) {
        await sleep(250 * 2 ** attempt)
        continue
      }
      return { content: null, upstreamStatus: lastStatus }
    } finally {
      clearTimeout(timer)
    }
  }

  return { content: null, upstreamStatus: lastStatus }
}

function liveThumbnailUrl(content: LiveMetaContent): string | null {
  const template = content.liveImageUrl?.trim()
  if (template) return template.replace("{type}", "720")
  return content.defaultThumbnailImageUrl?.trim() || null
}

/** 성공한 live-detail만 30초 보관. 실패는 바로 다시 친다. */
function getLiveDetailCached(channelId: string): Promise<LiveDetailResult> {
  const now = Date.now()
  const hit = liveDetailCache.get(channelId)
  if (hit && now - hit.at < LIVE_META_CACHE_MS) return Promise.resolve(hit.value)

  const pending = liveDetailInflight.get(channelId)
  if (pending) return pending

  const task = fetchLiveDetailContent(channelId)
    .then((value) => {
      if (value.content) liveDetailCache.set(channelId, { at: Date.now(), value })
      return value
    })
    .finally(() => {
      liveDetailInflight.delete(channelId)
    })
  liveDetailInflight.set(channelId, task)
  return task
}

export async function getChzzkLiveMetaFromUrl(url: string) {
  logTrace("chzzk.liveMeta", { hasUrl: Boolean(url?.trim()) })
  const channelId = extractChannelId(url)
  if (!channelId) {
    return { ok: false as const, code: "INVALID_URL", message: "유효한 치지직 URL이 아닙니다." }
  }

  const [{ content, upstreamStatus }, matched] = await Promise.all([
    getLiveDetailCached(channelId),
    db.query.streamers.findFirst({
      columns: { id: true, name: true },
      where: (s, { like }) => like(s.chzzkUrl, `%${channelId}%`),
    }),
  ])

  // Fly→치지직 일시 500/타임아웃 등이어도 502를 올리지 않음 (프론트·Vercel 노이즈 방지)
  if (!content) {
    logWarn("chzzk.live_meta_soft_fail", {
      channelId,
      upstreamStatus: upstreamStatus ?? undefined,
      matched: Boolean(matched),
    })
    return {
      ok: true as const,
      data: {
        title: "",
        category: "",
        categoryValue: "",
        channelName: "",
        isLive: false,
        viewerCount: null,
        thumbnailUrl: null,
        matchedStreamerId: matched?.id ?? null,
        matchedStreamerName: matched?.name ?? null,
      },
    }
  }

  logApi("chzzk-meta", { liveMeta: true, channelId, matched: Boolean(matched) })

  const liveTitle = content.liveTitle?.trim()
  const isLive = content.status === "OPEN"
  return {
    ok: true as const,
    data: {
      /** React controlled input 호환: null 대신 빈 문자열 */
      title: liveTitle || "",
      category: content.liveCategory?.trim() || "",
      categoryValue: content.liveCategoryValue?.trim() || "",
      channelName: content.channel?.channelName?.trim() || "",
      isLive,
      viewerCount: isLive ? (content.concurrentUserCount ?? null) : null,
      thumbnailUrl: isLive ? liveThumbnailUrl(content) : null,
      matchedStreamerId: matched?.id ?? null,
      matchedStreamerName: matched?.name ?? null,
    },
  }
}

async function fetchClipMeta(clipId: string): Promise<ClipMetaData | null> {
  const playInfoRes = await fetch(
    `https://api.chzzk.naver.com/service/v1/play-info/clip/${clipId}`,
    {
      headers: CHZZK_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(CLIP_FETCH_TIMEOUT_MS),
    },
  )
  if (!playInfoRes.ok) {
    logWarn("chzzk.clip_meta_upstream", { clipId, upstreamStatus: playInfoRes.status })
    return null
  }

  const playInfo = (await playInfoRes.json()) as {
    content?: { videoId?: string; inKey?: string; contentTitle?: string }
  }
  const videoId = playInfo?.content?.videoId ?? null
  const inKey = playInfo?.content?.inKey ?? null
  const title = playInfo?.content?.contentTitle?.trim() || ""
  if (!videoId || !inKey) return null

  const vodUrl =
    `https://apis.naver.com/neonplayer/vodplay/v1/playback/${videoId}` +
    `?key=${encodeURIComponent(inKey)}&sid=2208832&lang=ko_KR&connectType=PC` +
    `&playerType=HTML5_FLASH&videoId=${videoId}&playType=CLIP`

  const vodRes = await fetch(vodUrl, {
    headers: CHZZK_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(CLIP_FETCH_TIMEOUT_MS),
  })
  if (!vodRes.ok) return { thumbnailUrl: null, title }

  const thumbnailUrl = findCoverUrl(await vodRes.json())
  return { thumbnailUrl, title }
}

/** 썸네일을 받은 클립만 1시간 보관. 실패·썸네일 없음은 다시 조회한다. */
function getClipMetaCached(clipId: string): Promise<ClipMetaData | null> {
  const hit = clipMetaCache.get(clipId)
  if (hit && Date.now() - hit.at < CLIP_META_CACHE_MS) return Promise.resolve(hit.data)

  const pending = clipMetaInflight.get(clipId)
  if (pending) return pending

  const task = fetchClipMeta(clipId)
    .then((data) => {
      if (data?.thumbnailUrl) clipMetaCache.set(clipId, { at: Date.now(), data })
      return data
    })
    .finally(() => {
      clipMetaInflight.delete(clipId)
    })
  clipMetaInflight.set(clipId, task)
  return task
}

export async function getChzzkClipMetaFromUrl(url: string) {
  logTrace("chzzk.clipMeta", { hasUrl: Boolean(url?.trim()) })
  const clipId = extractChzzkClipId(url)
  if (!clipId) {
    return {
      ok: false as const,
      code: "INVALID_URL",
      message: "유효한 치지직 클립 URL이 아닙니다.",
      status: 400,
    }
  }

  try {
    const data = await getClipMetaCached(clipId)
    if (!data) {
      return {
        ok: false as const,
        code: "UPSTREAM_ERROR",
        message: "클립 정보를 가져올 수 없습니다.",
        status: 502,
      }
    }
    logApi("chzzk-meta", { clipMeta: true, clipId, thumbnail: Boolean(data.thumbnailUrl) })
    return { ok: true as const, data }
  } catch (error) {
    logWarn("chzzk.clip_meta_soft_fail", {
      clipId,
      message: error instanceof Error ? error.message : "timeout",
    })
    return {
      ok: false as const,
      code: "UPSTREAM_ERROR",
      message: "클립 정보를 가져올 수 없습니다.",
      status: 502,
    }
  }
}
