import { createId } from "@paralleldrive/cuid2"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { streamers } from "../db/schema"
import { streamerServerSchema, type StreamerPayload } from "../lib/streamer-schema"
import { logApi, logTrace } from "../lib/server-log"

function normalize(raw: unknown): StreamerPayload {
  return streamerServerSchema.parse(raw)
}

function profileImgValue(v: StreamerPayload): string | null {
  const p = v.profileImg?.trim()
  if (!p) return null
  return p
}

export async function createStreamer(raw: unknown): Promise<{ id: string }> {
  logTrace("streamers.create")
  const v = normalize(raw)
  const id = createId()
  await db.insert(streamers).values({
    id,
    name: v.name.trim(),
    handle: v.handle.trim().toLowerCase(),
    generation: v.generation,
    role: v.role?.trim() || null,
    platform: v.platform,
    profileImg: profileImgValue(v),
    colorCode: v.colorCode,
    chzzkUrl: v.chzzkUrl?.trim() || null,
    bio: v.bio?.trim() || null,
    isGuest: v.isGuest ?? false,
  })
  logApi("streamers", { create: id })
  return { id }
}

export async function updateStreamer(
  id: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  logTrace("streamers.update", { id })
  const v = normalize(raw)
  const updated = await db
    .update(streamers)
    .set({
      name: v.name.trim(),
      handle: v.handle.trim().toLowerCase(),
      generation: v.generation,
      role: v.role?.trim() || null,
      platform: v.platform,
      profileImg: profileImgValue(v),
      colorCode: v.colorCode,
      chzzkUrl: v.chzzkUrl?.trim() || null,
      bio: v.bio?.trim() || null,
      isGuest: v.isGuest ?? false,
    })
    .where(eq(streamers.id, id))
    .returning({ id: streamers.id })

  if (updated.length === 0) {
    logApi("streamers", { update: id, ok: false })
    return { ok: false, reason: "NOT_FOUND" }
  }
  logApi("streamers", { update: id, ok: true })
  return { ok: true }
}

export async function deleteStreamer(id: string): Promise<boolean> {
  logTrace("streamers.delete", { id })
  const trimmed = id?.trim()
  if (!trimmed) return false
  const removed = await db
    .delete(streamers)
    .where(eq(streamers.id, trimmed))
    .returning({ id: streamers.id })
  const ok = removed.length > 0
  logApi("streamers", { delete: trimmed, ok })
  return ok
}
