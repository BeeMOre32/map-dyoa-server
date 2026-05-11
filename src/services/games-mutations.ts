import { createId } from "@paralleldrive/cuid2"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db"
import { games } from "../db/schema"
import { logApi } from "../lib/server-log"

const gamePayloadSchema = z.object({
  title: z.string().min(1).max(100),
  isHoi4: z.boolean().optional(),
})

function normalize(raw: unknown) {
  const v = gamePayloadSchema.parse(raw)
  return {
    title: v.title.trim(),
    isHoi4: v.isHoi4 ?? false,
  }
}

export async function createGame(raw: unknown): Promise<{ id: string }> {
  const v = normalize(raw)
  const id = createId()
  await db.insert(games).values({
    id,
    title: v.title,
    isHoi4: v.isHoi4,
  })
  logApi("games", { create: id })
  return { id }
}

export async function updateGame(
  gameId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const v = normalize(raw)
  const rows = await db
    .update(games)
    .set({
      title: v.title,
      isHoi4: v.isHoi4,
    })
    .where(eq(games.id, gameId))
    .returning({ id: games.id })

  if (rows.length === 0) {
    logApi("games", { update: gameId, ok: false })
    return { ok: false, reason: "NOT_FOUND" }
  }
  logApi("games", { update: gameId, ok: true })
  return { ok: true }
}

export async function deleteGame(gameId: string): Promise<boolean> {
  const trimmed = gameId?.trim()
  if (!trimmed) return false
  const rows = await db
    .delete(games)
    .where(eq(games.id, trimmed))
    .returning({ id: games.id })
  const ok = rows.length > 0
  logApi("games", { delete: trimmed, ok })
  return ok
}
