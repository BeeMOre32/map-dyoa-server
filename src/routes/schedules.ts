import { Elysia, t } from "elysia"
import { ZodError } from "zod"
import { pgCode } from "../lib/pg-error"
import { logSchedules } from "../lib/server-log"
import { listClipsByScheduleIdPaginated } from "../services/clips"
import { createSchedule, deleteSchedule, updateSchedule } from "../services/schedules-mutations"
import { getScheduleById, listSchedules } from "../services/schedules"

export const schedulesRoutes = new Elysia({ prefix: "/schedules" })
  .get(
    "/",
    async ({ query, set }) => {
      const result = await listSchedules({
        from: query.from,
        to: query.to,
        period: query.period,
        year: query.year,
        month: query.month,
      })
      if (!result.ok) {
        logSchedules("list", { error: result.code })
        set.status = 400
        return { error: result.code, message: result.message }
      }
      return {
        schedules: result.schedules,
        window: result.window,
        meta: result.meta,
      }
    },
    {
      query: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        period: t.Optional(t.String()),
        year: t.Optional(t.String()),
        month: t.Optional(t.String()),
      }),
    },
  )
  .post("/", async ({ body, set }) => {
    try {
      const { id } = await createSchedule(body)
      set.status = 201
      return { id }
    } catch (e) {
      if (e instanceof ZodError) {
        set.status = 400
        return { error: "VALIDATION" as const, issues: e.flatten() }
      }
      if (pgCode(e) === "23503") {
        set.status = 400
        return {
          error: "FK_VIOLATION" as const,
          message: "존재하지 않는 게임 또는 스트리머 참조입니다.",
        }
      }
      set.status = 500
      return { error: "INTERNAL" as const }
    }
  })
  .patch("/:id", async ({ params, body, set }) => {
    try {
      const r = await updateSchedule(params.id, body)
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
      if (pgCode(e) === "23503") {
        set.status = 400
        return {
          error: "FK_VIOLATION" as const,
          message: "존재하지 않는 게임 또는 스트리머 참조입니다.",
        }
      }
      set.status = 500
      return { error: "INTERNAL" as const }
    }
  })
  .delete("/:id", async ({ params, set }) => {
    const ok = await deleteSchedule(params.id)
    if (!ok) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return { ok: true as const }
  })
  .get(
    "/:id/clips",
    async ({ params, query }) => {
      const page = query.page ? Number(query.page) : 1
      const pageSize = query.pageSize ? Number(query.pageSize) : 20
      return listClipsByScheduleIdPaginated({
        scheduleId: params.id,
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 20,
      })
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      }),
    },
  )
  .get("/:id", async ({ params, set }) => {
    const schedule = await getScheduleById(params.id)
    if (!schedule) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return schedule
  })
