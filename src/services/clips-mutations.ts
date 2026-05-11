import { createId } from "@paralleldrive/cuid2"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { clipParticipants, clips } from "../db/schema"
import { clipServerSchema, type ClipPayload } from "../lib/clip-schema"
import { logApi, logTrace } from "../lib/server-log"

function normalize(raw: unknown): ClipPayload {
  return clipServerSchema.parse(raw)
}

export async function createClip(raw: unknown): Promise<{ id: string }> {
  logTrace("clips.create")
  const v = normalize(raw)
  const id = createId()

  await db.transaction(async (tx) => {
    await tx.insert(clips).values({
      id,
      title: v.title.trim(),
      url: v.url.trim(),
      thumbnailUrl: v.thumbnailUrl?.trim() || null,
      description: v.description?.trim() || null,
      clipDate: v.clipDate ?? null,
      scheduleId: v.scheduleId?.trim() || null,
    })

    await tx.insert(clipParticipants).values(
      v.streamerIds.map((streamerId) => ({
        id: createId(),
        clipId: id,
        streamerId,
      })),
    )
  })

  logApi("clips", { create: id, participants: v.streamerIds.length })
  return { id }
}

export async function updateClip(
  clipId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  logTrace("clips.update", { clipId })
  const v = normalize(raw)

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(clips)
      .set({
        title: v.title.trim(),
        url: v.url.trim(),
        thumbnailUrl: v.thumbnailUrl?.trim() || null,
        description: v.description?.trim() || null,
        clipDate: v.clipDate ?? null,
        scheduleId: v.scheduleId?.trim() || null,
      })
      .where(eq(clips.id, clipId))
      .returning({ id: clips.id })

    if (updated.length === 0) return false

    await tx.delete(clipParticipants).where(eq(clipParticipants.clipId, clipId))

    await tx.insert(clipParticipants).values(
      v.streamerIds.map((streamerId) => ({
        id: createId(),
        clipId,
        streamerId,
      })),
    )
    return true
  })

  if (!result) {
    logApi("clips", { update: clipId, ok: false })
    return { ok: false, reason: "NOT_FOUND" }
  }
  logApi("clips", { update: clipId, ok: true, participants: v.streamerIds.length })
  return { ok: true }
}

export async function deleteClip(clipId: string): Promise<boolean> {
  logTrace("clips.delete", { clipId })
  const trimmed = clipId?.trim()
  if (!trimmed) return false
  const removed = await db
    .delete(clips)
    .where(eq(clips.id, trimmed))
    .returning({ id: clips.id })
  const ok = removed.length > 0
  logApi("clips", { delete: trimmed, ok })
  return ok
}
