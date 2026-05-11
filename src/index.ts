import { Elysia } from "elysia"
import { sql } from "drizzle-orm"
import { db } from "./db"

const port = Number(process.env.PORT ?? 3001)

const app = new Elysia()
  .get("/", () => ({
    service: "map-dyoa-server",
    status: "ok",
  }))
  .get("/health", async () => {
    await db.execute(sql`select 1`)
    return { ok: true as const, db: "up" as const }
  })
  .listen({ port, hostname: "0.0.0.0" })

console.log(
  `map-dyoa-server listening on http://${app.server?.hostname}:${app.server?.port}`,
)
