import { createId } from "@paralleldrive/cuid2"
import { and, eq, notInArray } from "drizzle-orm"
import { db } from "../db"
import { scheduleParticipants, schedules } from "../db/schema"
import { scheduleServerSchema, type SchedulePayload } from "../lib/schedule-schema"
import { logSchedules, logTrace } from "../lib/server-log"

function normalizePayload(raw: unknown): SchedulePayload {
  return scheduleServerSchema.parse(raw)
}

function liveUrlsFromPayload(v: SchedulePayload): string[] {
  return v.liveUrls?.map((u) => u.trim()).filter(Boolean) ?? []
}

function gameIdFromPayload(v: SchedulePayload): string | null {
  const g = v.gameId?.trim()
  return g || null
}

export async function createSchedule(raw: unknown): Promise<{ id: string }> {
  logTrace("schedules.create")
  const v = normalizePayload(raw)
  const id = createId()
  const liveUrls = liveUrlsFromPayload(v)
  const gameId = gameIdFromPayload(v)

  await db.transaction(async (tx) => {
    await tx.insert(schedules).values({
      id,
      title: v.title.trim(),
      content: null,
      startTime: v.startTime,
      endTime: null,
      isGuerrilla: v.isGuerrilla ?? false,
      isNaeJeon: v.isNaeJeon ?? false,
      isLiveEnded: false,
      liveUrls,
      gameId,
    })

    await tx.insert(scheduleParticipants).values(
      v.participants.map((p) => ({
        id: createId(),
        scheduleId: id,
        streamerId: p.id,
        nation: p.nation?.trim() || null,
        result: p.result || null,
        isGuest: p.isGuest ?? false,
      })),
    )
  })

  logSchedules("create", {
    id,
    scheduleParticipants: v.participants.length,
  })
  return { id }
}

export async function updateSchedule(
  scheduleId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  logTrace("schedules.update", { scheduleId })
  const v = normalizePayload(raw)
  const liveUrls = liveUrlsFromPayload(v)
  const gameId = gameIdFromPayload(v)
  const streamerIds = v.participants.map((p) => p.id)

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(schedules)
      .set({
        title: v.title.trim(),
        startTime: v.startTime,
        gameId,
        liveUrls,
        isGuerrilla: v.isGuerrilla ?? false,
        isNaeJeon: v.isNaeJeon ?? false,
        isLiveEnded: v.isLiveEnded ?? false,
      })
      .where(eq(schedules.id, scheduleId))
      .returning({ id: schedules.id })

    if (updated.length === 0) {
      return false
    }

    await tx
      .delete(scheduleParticipants)
      .where(
        and(
          eq(scheduleParticipants.scheduleId, scheduleId),
          notInArray(scheduleParticipants.streamerId, streamerIds),
        ),
      )

    for (const p of v.participants) {
      await tx
        .insert(scheduleParticipants)
        .values({
          id: createId(),
          scheduleId,
          streamerId: p.id,
          nation: p.nation?.trim() || null,
          result: p.result || null,
          isGuest: p.isGuest ?? false,
        })
        .onConflictDoUpdate({
          target: [
            scheduleParticipants.scheduleId,
            scheduleParticipants.streamerId,
          ],
          set: {
            nation: p.nation?.trim() || null,
            result: p.result || null,
            isGuest: p.isGuest ?? false,
          },
        })
    }

    return true
  })

  if (!result) {
    logSchedules("update", { id: scheduleId, ok: false, reason: "NOT_FOUND" })
    return { ok: false, reason: "NOT_FOUND" }
  }
  logSchedules("update", {
    id: scheduleId,
    ok: true,
    scheduleParticipants: v.participants.length,
  })
  return { ok: true }
}

export async function deleteSchedule(
  scheduleId: string,
): Promise<boolean> {
  logTrace("schedules.delete", { scheduleId })
  const trimmed = scheduleId?.trim()
  if (!trimmed) return false

  const removed = await db
    .delete(schedules)
    .where(eq(schedules.id, trimmed))
    .returning({ id: schedules.id })

  const ok = removed.length > 0
  logSchedules("delete", { id: trimmed, ok })
  return ok
}
