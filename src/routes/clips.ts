import { Elysia, t } from "elysia"
import { mutationErrorResponse } from "../lib/route-error"
import { createClip, deleteClip, updateClip } from "../services/clips-mutations"
import {
  getClipById,
  getClipMonths,
  listClipsPaginated,
  type ClipSortOption,
} from "../services/clips"

const SORTS: ClipSortOption[] = [
  "newest",
  "oldest",
  "date_desc",
  "date_asc",
  "title",
]

export const clipsRoutes = new Elysia({ prefix: "/clips" })
  .get("/months", async () => {
    const months = await getClipMonths()
    return { months }
  })
  .get(
    "/",
    async ({ query }) => {
      const sort = SORTS.includes(query.sort as ClipSortOption)
        ? (query.sort as ClipSortOption)
        : "newest"
      const page = query.page ? Number(query.page) : 1
      const pageSize = query.pageSize ? Number(query.pageSize) : 20
      const clipsOnly =
        query.clipsOnly === "1" || query.clipsOnly === "true"
      const streamerIds = query.streamers
        ? query.streamers.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined
      return listClipsPaginated({
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 20,
        streamerId: streamerIds?.length === 1 ? streamerIds[0] : query.streamer,
        streamerIds: streamerIds && streamerIds.length > 1 ? streamerIds : undefined,
        month: query.month,
        q: query.q,
        sort,
        clipsOnly,
      })
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
        streamer: t.Optional(t.String()),
        streamers: t.Optional(t.String()),
        month: t.Optional(t.String()),
        q: t.Optional(t.String()),
        sort: t.Optional(t.String()),
        clipsOnly: t.Optional(t.String()),
      }),
    },
  )
  .post("/", async ({ body, set }) => {
    try {
      const { id } = await createClip(body)
      set.status = 201
      return { id }
    } catch (e) {
      return mutationErrorResponse(e, set, {
        scope: "clips.create",
        fkMessage: "존재하지 않는 스트리머 또는 일정 참조입니다.",
      })
    }
  })
  .patch("/:id", async ({ params, body, set }) => {
    try {
      const r = await updateClip(params.id, body)
      if (!r.ok) {
        set.status = 404
        return { error: "NOT_FOUND" as const }
      }
      return { ok: true as const }
    } catch (e) {
      return mutationErrorResponse(e, set, {
        scope: "clips.update",
        fkMessage: "존재하지 않는 스트리머 또는 일정 참조입니다.",
      })
    }
  })
  .delete("/:id", async ({ params, set }) => {
    const ok = await deleteClip(params.id)
    if (!ok) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return { ok: true as const }
  })
  .get("/:id", async ({ params, set }) => {
    const clip = await getClipById(params.id)
    if (!clip) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return clip
  })
