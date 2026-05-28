import { createId } from "@paralleldrive/cuid2"
import { and, eq, notInArray } from "drizzle-orm"
import { db } from "../db"
import { scheduleParticipants, schedules } from "../db/schema"
import {
  scheduleServerSchema,
  scheduleUpdateSchema,
  type SchedulePayload,
  type ScheduleUpdatePayload,
} from "../lib/schedule-schema"
import { logSchedules, logTrace } from "../lib/server-log"

const SCHEDULE_CONFLICT_MESSAGE =
  "다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해주세요."

function normalizeCreatePayload(raw: unknown): SchedulePayload {
  return scheduleServerSchema.parse(raw)
}

function normalizeUpdatePayload(raw: unknown): ScheduleUpdatePayload {
  return scheduleUpdateSchema.parse(raw)
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
  const v = normalizeCreatePayload(raw)
  const id = createId()
  const liveUrls = liveUrlsFromPayload(v)
  const gameId = gameIdFromPayload(v)
  const now = new Date()

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
      updatedAt: now,
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
): Promise<
  { ok: true } | { ok: false; reason: "NOT_FOUND" | "CONFLICT"; message?: string }
> {
  logTrace("schedules.update", { scheduleId })
  const v = normalizeUpdatePayload(raw)
  const liveUrls = liveUrlsFromPayload(v)
  const gameId = gameIdFromPayload(v)
  const streamerIds = v.participants.map((p) => p.id)
  const now = new Date()

  const result = await db.transaction(async (tx) => {
    const whereClause = v.expectedUpdatedAt
      ? and(
          eq(schedules.id, scheduleId),
          eq(schedules.updatedAt, v.expectedUpdatedAt),
        )
      : eq(schedules.id, scheduleId)

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
        updatedAt: now,
      })
      .where(whereClause)
      .returning({ id: schedules.id })

    if (updated.length === 0) {
      const exists = await tx.query.schedules.findFirst({
        where: eq(schedules.id, scheduleId),
        columns: { id: true },
      })
      if (!exists) return { status: "NOT_FOUND" as const }
      if (v.expectedUpdatedAt) return { status: "CONFLICT" as const }
      return { status: "NOT_FOUND" as const }
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
          result: p.result ?? null,
          isGuest: p.isGuest ?? false,
        })
        .onConflictDoUpdate({
          target: [
            scheduleParticipants.scheduleId,
            scheduleParticipants.streamerId,
          ],
          set: {
            nation: p.nation?.trim() || null,
            result: p.result ?? null,
            isGuest: p.isGuest ?? false,
          },
        })
    }

    return { status: "OK" as const }
  })

  if (result.status === "NOT_FOUND") {
    logSchedules("update", { id: scheduleId, ok: false, reason: "NOT_FOUND" })
    return { ok: false, reason: "NOT_FOUND" }
  }
  if (result.status === "CONFLICT") {
    logSchedules("update", { id: scheduleId, ok: false, reason: "CONFLICT" })
    return { ok: false, reason: "CONFLICT", message: SCHEDULE_CONFLICT_MESSAGE }
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
