import { Elysia, t } from "elysia"
import { logWarn } from "../lib/server-log"
import { getLiveStreamerIds } from "../services/chzzk-live-status"
import { getChzzkClipMetaFromUrl, getChzzkLiveMetaFromUrl } from "../services/chzzk-meta"

export const chzzkRoutes = new Elysia({ prefix: "/chzzk" })
  .get("/live-status", async () => {
    const liveStreamerIds = await getLiveStreamerIds()
    return { liveStreamerIds }
  })
  .get(
    "/live-meta",
    async ({ query, set }) => {
      const url = query.url.trim()
      if (!url) {
        set.status = 400
        return { error: "url required" as const }
      }
      const r = await getChzzkLiveMetaFromUrl(url)
      if (!r.ok) {
        const status = (r as { status?: number }).status ?? 400
        set.status = status
        if (status >= 500) {
          logWarn("chzzk.live_meta_failed", {
            status,
            code: "code" in r ? String(r.code) : undefined,
            message: r.message,
          })
        }
        return { error: r.message }
      }
      return r.data
    },
    { query: t.Object({ url: t.String() }) },
  )
  .get(
    "/clip-meta",
    async ({ query, set }) => {
      const url = query.url.trim()
      if (!url) {
        set.status = 400
        return { error: "url required" as const }
      }
      const r = await getChzzkClipMetaFromUrl(url)
      if (!r.ok) {
        const status = r.status ?? 400
        set.status = status
        if (status >= 500) {
          logWarn("chzzk.clip_meta_failed", {
            status,
            code: "code" in r ? String(r.code) : undefined,
            message: r.message,
          })
        }
        return { error: r.message }
      }
      return r.data
    },
    { query: t.Object({ url: t.String() }) },
  )
