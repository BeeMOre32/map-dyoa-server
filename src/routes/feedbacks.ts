import { Elysia, t } from "elysia"
import { ZodError } from "zod"
import {
  createFeedback,
  listFeedbacks,
  updateFeedbackStatus,
} from "../services/feedbacks"

export const feedbacksRoutes = new Elysia({ prefix: "/feedbacks" })
  .get(
    "/",
    async ({ query }) => {
      const feedbacks = await listFeedbacks({ status: query.status })
      return { feedbacks }
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
      }),
    },
  )
  .post("/", async ({ body, set }) => {
    try {
      const { id } = await createFeedback(body)
      set.status = 201
      return { id }
    } catch (e) {
      if (e instanceof ZodError) {
        set.status = 400
        return { error: "VALIDATION" as const, issues: e.flatten() }
      }
      set.status = 500
      return { error: "INTERNAL" as const }
    }
  })
  .patch("/:id/reject", async ({ params, set }) => {
    const r = await updateFeedbackStatus(params.id, "REJECTED")
    if (!r.ok) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return { ok: true as const }
  })
  .patch("/:id/resolve", async ({ params, set }) => {
    const r = await updateFeedbackStatus(params.id, "RESOLVED")
    if (!r.ok) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return { ok: true as const }
  })
