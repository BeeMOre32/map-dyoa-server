import { pgCode } from "../lib/pg-error"
import { streamerServerSchema } from "../lib/streamer-schema"
import { logApi, logTrace } from "../lib/server-log"
import { createStreamer } from "./streamers-mutations"
import { z } from "zod"

const bulkSchema = z.array(streamerServerSchema).min(1)

export async function bulkCreateStreamers(raw: unknown): Promise<{ created: number }> {
  logTrace("streamers.bulkCreate")
  const items = bulkSchema.parse(raw)
  let created = 0
  for (const item of items) {
    try {
      await createStreamer(item)
      created++
    } catch (e) {
      if (pgCode(e) === "23505") continue
      throw e
    }
  }
  logApi("streamers", { bulkCreate: true, created, requested: items.length })
  return { created }
}
