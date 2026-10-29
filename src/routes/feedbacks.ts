import { Elysia, t } from "elysia"
import { mutationErrorResponse } from "../lib/route-error"
import {
  createFeedback,
  listFeedbacks,
  lookupFeedbackReplies,
  replyToFeedback,
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
      const created = await createFeedback(body)
      set.status = 201
      return created
    } catch (e) {
      return mutationErrorResponse(e, set, { scope: "feedbacks.create" })
    }
  })
  .post(
    "/receipts",
    async ({ body }) => {
      const replies = await lookupFeedbackReplies(body.receipts)
      return { replies }
    },
    {
      body: t.Object({
        receipts: t.Array(
          t.Object({
            id: t.String({ minLength: 8, maxLength: 64 }),
            receipt: t.String({ minLength: 43, maxLength: 43 }),
          }),
          { maxItems: 20 },
        ),
      }),
    },
  )
  .patch(
    "/:id/reply",
    async ({ params, body, set }) => {
      const r = await replyToFeedback(params.id, body.reply)
      if (!r.ok) {
        set.status = r.reason === "NOT_FOUND" ? 404 : 400
        return { error: r.reason }
      }
      return { ok: true as const }
    },
    {
      body: t.Object({
        reply: t.String({ minLength: 1, maxLength: 500 }),
      }),
    },
  )
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
