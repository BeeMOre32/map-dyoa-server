import { createId } from "@paralleldrive/cuid2"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db"
import { bongnudoProfiles } from "../db/schema"
import { logApi, logTrace } from "../lib/server-log"

const DEFAULT_SEASON = "bongnudo2"

const upsertSchema = z.object({
  seasonKey: z.string().trim().min(1).max(40).optional(),
  rpName: z.string().trim().max(40).optional().default(""),
  occupation: z.string().trim().max(40).optional().default(""),
  factionId: z.string().trim().max(40).optional().default(""),
  concept: z.string().trim().max(200).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  updatedByUserId: z.string().trim().max(64).optional(),
})

export type BongnudoProfileDto = {
  streamerId: string
  rpName: string
  occupation: string
  factionId: string
  concept: string
  notes: string
  updatedAt: string
}

function toDto(row: {
  streamerId: string
  rpName: string | null
  occupation: string | null
  factionId: string | null
  concept: string | null
  notes: string | null
  updatedAt: Date
}): BongnudoProfileDto {
  return {
    streamerId: row.streamerId,
    rpName: row.rpName ?? "",
    occupation: row.occupation ?? "",
    factionId: row.factionId ?? "",
    concept: row.concept ?? "",
    notes: row.notes ?? "",
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listBongnudoProfiles(seasonKey = DEFAULT_SEASON) {
  logTrace("bongnudo.profiles.list", { seasonKey })
  const rows = await db.query.bongnudoProfiles.findMany({
    where: (p, { eq }) => eq(p.seasonKey, seasonKey),
  })
  logApi("bongnudo", { list: true, seasonKey, count: rows.length })
  return rows.map(toDto)
}

export async function upsertBongnudoProfile(
  streamerId: string,
  raw: unknown,
): Promise<BongnudoProfileDto> {
  logTrace("bongnudo.profiles.upsert", { streamerId })
  const v = upsertSchema.parse(raw)
  const seasonKey = v.seasonKey ?? DEFAULT_SEASON
  const now = new Date()
  const values = {
    rpName: v.rpName.trim() || null,
    occupation: v.occupation.trim() || null,
    factionId: v.factionId.trim() || null,
    concept: v.concept.trim() || null,
    notes: v.notes.trim() || null,
    updatedByUserId: v.updatedByUserId?.trim() || null,
    updatedAt: now,
  }

  const existing = await db.query.bongnudoProfiles.findFirst({
    where: (p, { and, eq }) =>
      and(eq(p.seasonKey, seasonKey), eq(p.streamerId, streamerId)),
  })

  if (existing) {
    const [row] = await db
      .update(bongnudoProfiles)
      .set(values)
      .where(
        and(
          eq(bongnudoProfiles.seasonKey, seasonKey),
          eq(bongnudoProfiles.streamerId, streamerId),
        ),
      )
      .returning()
    logApi("bongnudo", { update: streamerId, seasonKey })
    return toDto(row)
  }

  const [row] = await db
    .insert(bongnudoProfiles)
    .values({
      id: createId(),
      seasonKey,
      streamerId,
      createdAt: now,
      ...values,
    })
    .returning()
  logApi("bongnudo", { create: streamerId, seasonKey })
  return toDto(row)
}
