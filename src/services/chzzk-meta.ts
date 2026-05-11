import { db } from "../db"
import { logApi } from "../lib/server-log"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

function extractChannelId(url: string): string | null {
  try {
    const { hostname, pathname } = new URL(url)
    if (!hostname.includes("chzzk.naver.com")) return null
    const segments = pathname.split("/").filter(Boolean)
    const last = segments[segments.length - 1]
    if (!last || last === "live") return null
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

export async function getChzzkLiveMetaFromUrl(url: string) {
  const channelId = extractChannelId(url)
  if (!channelId) {
    return { ok: false as const, code: "INVALID_URL", message: "유효한 치지직 URL이 아닙니다." }
  }

  const [liveRes, streamers] = await Promise.all([
    fetch(`https://api.chzzk.naver.com/service/v2/channels/${channelId}/live-detail`, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    }),
    db.query.streamers.findMany({
      columns: { id: true, name: true, chzzkUrl: true },
      where: (s, { isNotNull }) => isNotNull(s.chzzkUrl),
    }),
  ])

  if (!liveRes.ok) {
    return {
      ok: false as const,
      code: "UPSTREAM_ERROR",
      message: `CHZZK API 오류: ${liveRes.status}`,
      status: 502,
    }
  }

  const json = (await liveRes.json()) as {
    content?: { liveTitle?: string; liveCategory?: string; channel?: { channelName?: string } }
  }
  const matched = streamers.find((s) => s.chzzkUrl?.includes(channelId))
  logApi("chzzk-meta", { liveMeta: true, channelId, matched: Boolean(matched) })

  return {
    ok: true as const,
    data: {
      title: json?.content?.liveTitle ?? null,
      category: json?.content?.liveCategory ?? null,
      channelName: json?.content?.channel?.channelName ?? null,
      matchedStreamerId: matched?.id ?? null,
      matchedStreamerName: matched?.name ?? null,
    },
  }
}

export async function getChzzkClipMetaFromUrl(url: string) {
  const clipId = extractChzzkClipId(url)
  if (!clipId) {
    return {
      ok: false as const,
      code: "INVALID_URL",
      message: "유효한 치지직 클립 URL이 아닙니다.",
      status: 400,
    }
  }

  const playInfoRes = await fetch(
    `https://api.chzzk.naver.com/service/v1/play-info/clip/${clipId}`,
    { headers: { "User-Agent": UA }, cache: "no-store" },
  )
  if (!playInfoRes.ok) {
    return {
      ok: false as const,
      code: "UPSTREAM_ERROR",
      message: `play-info 오류: ${playInfoRes.status}`,
      status: 502,
    }
  }

  const playInfo = (await playInfoRes.json()) as {
    content?: { videoId?: string; inKey?: string; contentTitle?: string }
  }
  const videoId = playInfo?.content?.videoId ?? null
  const inKey = playInfo?.content?.inKey ?? null
  const title = playInfo?.content?.contentTitle ?? null
  if (!videoId || !inKey) {
    return {
      ok: false as const,
      code: "UPSTREAM_ERROR",
      message: "클립 정보를 가져올 수 없습니다.",
      status: 502,
    }
  }

  const vodUrl =
    `https://apis.naver.com/neonplayer/vodplay/v1/playback/${videoId}` +
    `?key=${encodeURIComponent(inKey)}&sid=2208832&lang=ko_KR&connectType=PC` +
    `&playerType=HTML5_FLASH&videoId=${videoId}&playType=CLIP`

  const vodRes = await fetch(vodUrl, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  })
  if (!vodRes.ok) {
    logApi("chzzk-meta", { clipMeta: true, clipId, vodStatus: vodRes.status })
    return { ok: true as const, data: { thumbnailUrl: null, title } }
  }

  const vodData = await vodRes.json()
  const thumbnailUrl = findCoverUrl(vodData)
  logApi("chzzk-meta", { clipMeta: true, clipId, thumbnail: Boolean(thumbnailUrl) })
  return { ok: true as const, data: { thumbnailUrl, title } }
}
