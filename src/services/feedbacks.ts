import { createId } from "@paralleldrive/cuid2"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db"
import { feedbacks } from "../db/schema"
import { logApi, logTrace } from "../lib/server-log"

const feedbackTypeSchema = z.enum(["EDIT_REQUEST", "ERROR_REPORT"])

const createFeedbackSchema = z.object({
  type: feedbackTypeSchema.optional().default("EDIT_REQUEST"),
  streamerId: z.string().optional(),
  streamerName: z.string().optional(),
  category: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
})

export async function listFeedbacks(opts?: { status?: string }) {
  logTrace("feedbacks.list", { status: opts?.status })
  const status = opts?.status?.trim()
  const rows = await db.query.feedbacks.findMany({
    ...(status ? { where: (f, { eq }) => eq(f.status, status) } : {}),
    columns: {
      id: true,
      type: true,
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
  logTrace("feedbacks.create")
  const v = createFeedbackSchema.parse(raw)
  const id = createId()
  const now = new Date()
  await db.insert(feedbacks).values({
    id,
    type: v.type,
    category: v.category.trim(),
    content: v.content.trim(),
    streamerId: v.streamerId?.trim() || null,
    streamerName: v.streamerName?.trim() || null,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  })
  logApi("feedbacks", { create: id })
  return { id }
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: "REJECTED" | "RESOLVED",
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  logTrace("feedbacks.updateStatus", { feedbackId, status })
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
  logTrace("feedbacks.countPending")
  const rows = await db.query.feedbacks.findMany({
    columns: { id: true },
    where: (f, { eq }) => eq(f.status, "PENDING"),
  })
  return rows.length
}
