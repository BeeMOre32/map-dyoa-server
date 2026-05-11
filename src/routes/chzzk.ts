import { Elysia, t } from "elysia"
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
        set.status = (r as { status?: number }).status ?? 400
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
        set.status = r.status ?? 400
        return { error: r.message }
      }
      return r.data
    },
    { query: t.Object({ url: t.String() }) },
  )
