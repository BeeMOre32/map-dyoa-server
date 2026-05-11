import { Elysia } from "elysia"
import { ZodError } from "zod"
import { pgCode } from "../lib/pg-error"
import { createGame, deleteGame, updateGame } from "../services/games-mutations"
import { getGameById, listGamesWithScheduleCount } from "../services/games"

export const gamesRoutes = new Elysia({ prefix: "/games" })
  .get("/", async () => {
    const games = await listGamesWithScheduleCount()
    return { games }
  })
  .post("/", async ({ body, set }) => {
    try {
      const { id } = await createGame(body)
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
          message: "이미 사용 중인 게임 제목입니다.",
        }
      }
      set.status = 500
      return { error: "INTERNAL" as const }
    }
  })
  .patch("/:id", async ({ params, body, set }) => {
    try {
      const r = await updateGame(params.id, body)
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
          message: "이미 사용 중인 게임 제목입니다.",
        }
      }
      set.status = 500
      return { error: "INTERNAL" as const }
    }
  })
  .delete("/:id", async ({ params, set }) => {
    const ok = await deleteGame(params.id)
    if (!ok) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return { ok: true as const }
  })
  .get("/:id", async ({ params, set }) => {
    const game = await getGameById(params.id)
    if (!game) {
      set.status = 404
      return { error: "NOT_FOUND" as const }
    }
    return game
  })
