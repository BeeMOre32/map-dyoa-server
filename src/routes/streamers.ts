import { Elysia, t } from "elysia"
import { mutationErrorResponse } from "../lib/route-error"
import { bulkCreateStreamers } from "../services/streamers-bulk"
import {
  createStreamer,
  deleteStreamer,
  updateStreamer,
} from "../services/streamers-mutations"
import { getStreamerDetailBundle } from "../services/streamer-detail"
import { getStreamerById, listStreamers } from "../services/streamers"

export const streamersRoutes = new Elysia({ prefix: "/streamers" })
  .get(
    "/",
    async ({ query }) => {
      const membersOnly =
        query.membersOnly === "1" || query.membersOnly === "true"
      const streamers = await listStreamers({ membersOnly })
      return { streamers }
    },
    {
      query: t.Object({
        membersOnly: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/bulk",
    async ({ body, set }) => {
      try {
        const list = Array.isArray((body as { streamers?: unknown })?.streamers)
          ? (body as { streamers: unknown[] }).streamers
          : body
        const { created } = await bulkCreateStreamers(list)
        set.status = 201
        return { created }
      } catch (e) {
        return mutationErrorResponse(e, set, {
          scope: "streamers.bulk",
          duplicateMessage: "이미 사용 중인 이름 또는 핸들입니다.",
        })
      }
    },
    {
      body: t.Object({
        streamers: t.Array(t.Any()),
      }),
    },
  )
  .post("/", async ({ body, set }) => {
    try {
      const { id } = await createStreamer(body)
      set.status = 201
      return { id }
    } catch (e) {
      return mutationErrorResponse(e, set, {
        scope: "streamers.create",
        duplicateMessage: "이미 사용 중인 이름 또는 핸들입니다.",
      })
    }
  })
  .patch("/:id", async ({ params, body, set }) => {
    try {
      const r = await updateStreamer(params.id, body)
      if (!r.ok) {
        set.status = 404
        return { error: "NOT_FOUND" as const }
      }
      return { ok: true as const }
    } catch (e) {
      return mutationErrorResponse(e, set, {
        scope: "streamers.update",
        duplicateMessage: "이미 사용 중인 이름 또는 핸들입니다.",
      })
    }
  })
  .delete("/:id", async ({ params, set }) => {
    const ok = await deleteStreamer(params.id)
    if (!ok) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return { ok: true as const }
  })
  .get("/:id/detail", async ({ params, set }) => {
    const row = await getStreamerById(params.id)
    if (!row) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return getStreamerDetailBundle(params.id)
  })
  .get("/:id", async ({ params, set }) => {
    const streamer = await getStreamerById(params.id)
    if (!streamer) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return streamer
  })
