import { Elysia, t } from "elysia"
import { mutationErrorResponse } from "../lib/route-error"
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
      return mutationErrorResponse(e, set, { scope: "feedbacks.create" })
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
