import { Elysia, t } from "elysia"
import { mutationErrorResponse } from "../lib/route-error"
import {
  approveClipCandidate,
  ClipCandidateError,
  dismissClipCandidate,
  listPendingClipCandidates,
  scanClipCandidates,
} from "../services/clip-candidates"

function candidateError(
  e: unknown,
  set: { status?: number | string },
): { error: string; message: string } | null {
  if (!(e instanceof ClipCandidateError)) return null
  set.status = e.status
  return { error: e.status === 404 ? "NOT_FOUND" : "ALREADY_RESOLVED", message: e.message }
}

export const clipCandidateRoutes = new Elysia({ prefix: "/clip-candidates" })
  .get(
    "/",
    async ({ query }) => {
      const limit = query.limit ? Number(query.limit) : 40
      const candidates = await listPendingClipCandidates(
        Number.isFinite(limit) ? limit : 40,
      )
      return { candidates }
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
    },
  )
  .post("/scan", async () => {
    const result = await scanClipCandidates()
    return { ok: true as const, ...result }
  })
  .post(
    "/:id/approve",
    async ({ params, body, set }) => {
      try {
        const data = await approveClipCandidate(params.id, body.title)
        return data
      } catch (e) {
        const known = candidateError(e, set)
        if (known) return known
        return mutationErrorResponse(e, set, { scope: "clipCandidates.approve" })
      }
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
      }),
    },
  )
  .post("/:id/dismiss", async ({ params, set }) => {
    try {
      await dismissClipCandidate(params.id)
      return { ok: true as const }
    } catch (e) {
      const known = candidateError(e, set)
      if (known) return known
      return mutationErrorResponse(e, set, { scope: "clipCandidates.dismiss" })
    }
  })
