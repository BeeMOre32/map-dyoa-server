import { createId } from "@paralleldrive/cuid2"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db"
import { feedbacks } from "../db/schema"
import { logApi } from "../lib/server-log"

const createFeedbackSchema = z.object({
  streamerId: z.string().optional(),
  streamerName: z.string().optional(),
  category: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
})

export async function listFeedbacks(opts?: { status?: string }) {
  const status = opts?.status?.trim()
  const rows = await db.query.feedbacks.findMany({
    ...(status ? { where: (f, { eq }) => eq(f.status, status) } : {}),
    columns: {
      id: true,
      status: true,
      category: true,
      streamerName: true,
      content: true,
      createdAt: true,
    },
    orderBy: (f, { desc }) => [desc(f.createdAt)],
  })
  logApi("feedbacks", { list: true, status: status ?? "ALL", count: rows.length })
  return rows
}

export async function createFeedback(raw: unknown): Promise<{ id: string }> {
  const v = createFeedbackSchema.parse(raw)
  const id = createId()
  await db.insert(feedbacks).values({
    id,
    type: "EDIT_REQUEST",
    category: v.category.trim(),
    content: v.content.trim(),
    streamerId: v.streamerId?.trim() || null,
    streamerName: v.streamerName?.trim() || null,
    status: "PENDING",
  })
  logApi("feedbacks", { create: id })
  return { id }
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: "REJECTED" | "RESOLVED",
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const rows = await db
    .update(feedbacks)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(feedbacks.id, feedbackId))
    .returning({ id: feedbacks.id })

  if (rows.length === 0) {
    logApi("feedbacks", { update: feedbackId, status, ok: false })
    return { ok: false, reason: "NOT_FOUND" }
  }
  logApi("feedbacks", { update: feedbackId, status, ok: true })
  return { ok: true }
}

export async function countPendingFeedbacks() {
  const rows = await db.query.feedbacks.findMany({
    columns: { id: true },
    where: (f, { eq }) => eq(f.status, "PENDING"),
  })
  return rows.length
}
