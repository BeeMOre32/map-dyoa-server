import { Elysia, t } from "elysia"
import { ZodError } from "zod"
import { pgCode } from "../lib/pg-error"
import {
  createStreamer,
  deleteStreamer,
  updateStreamer,
} from "../services/streamers-mutations"
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
  .post("/", async ({ body, set }) => {
    try {
      const { id } = await createStreamer(body)
      set.status = 201
      return { id }
    } catch (e) {
      if (e instanceof ZodError) {
        set.status = 400
        return { error: "VALIDATION" as const, issues: e.flatten() }
      }
      if (pgCode(e) === "23505") {
        set.status = 409
        return {
          error: "DUPLICATE_ENTRY" as const,
          message: "이미 사용 중인 이름 또는 핸들입니다.",
        }
      }
      if (pgCode(e) === "23503") {
        set.status = 400
        return { error: "FK_VIOLATION" as const }
      }
      set.status = 500
      return { error: "INTERNAL" as const }
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
      if (e instanceof ZodError) {
        set.status = 400
        return { error: "VALIDATION" as const, issues: e.flatten() }
      }
      if (pgCode(e) === "23505") {
        set.status = 409
        return {
          error: "DUPLICATE_ENTRY" as const,
          message: "이미 사용 중인 이름 또는 핸들입니다.",
        }
      }
      set.status = 500
      return { error: "INTERNAL" as const }
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
  .get("/:id", async ({ params, set }) => {
    const streamer = await getStreamerById(params.id)
    if (!streamer) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return streamer
  })
