import { Elysia } from "elysia"
import { sql } from "drizzle-orm"
import { db } from "../db"
import { clips, schedules, streamers } from "../db/schema"
import { logWarn } from "../lib/server-log"

async function probeTable(
  label: "schedules" | "streamers" | "clips",
  run: () => Promise<unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await run()
    return { ok: true as const }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logWarn("health.feature_failed", { feature: label, error: message })
    return { ok: false as const, error: message }
  }
}

export const healthRoutes = new Elysia({ prefix: "/health" })
  .get("/live", () => ({ ok: true as const }))
  .get("/db", async () => {
    await db.execute(sql`select 1`)
    return { ok: true as const, db: "up" as const }
  })
  .get("/schedules", async ({ set }) => {
    const r = await probeTable("schedules", () =>
      db.select({ id: schedules.id }).from(schedules).limit(1),
    )
    if (!r.ok) {
      set.status = 503
      return { ok: false as const, error: r.error }
    }
    return { ok: true as const }
  })
  .get("/streamers", async ({ set }) => {
    const r = await probeTable("streamers", () =>
      db.select({ id: streamers.id }).from(streamers).limit(1),
    )
    if (!r.ok) {
      set.status = 503
      return { ok: false as const, error: r.error }
    }
    return { ok: true as const }
  })
  .get("/clips", async ({ set }) => {
    const r = await probeTable("clips", () =>
      db.select({ id: clips.id }).from(clips).limit(1),
    )
    if (!r.ok) {
      set.status = 503
      return { ok: false as const, error: r.error }
    }
    return { ok: true as const }
  })
  /** 호환: 기존 /health = db 프로브 */
  .get("/", async () => {
    await db.execute(sql`select 1`)
    return { ok: true as const, db: "up" as const }
  })
