import { Elysia } from "elysia"
import { sql } from "drizzle-orm"
import { db } from "./db"
import { adminRoutes } from "./routes/admin"
import { chzzkRoutes } from "./routes/chzzk"
import { corsPlugin } from "./plugins/cors"
import { feedbacksRoutes } from "./routes/feedbacks"
import { httpLogPlugin } from "./plugins/http-log"
import { clipsRoutes } from "./routes/clips"
import { gamesRoutes } from "./routes/games"
import { schedulesRoutes } from "./routes/schedules"
import { streamersRoutes } from "./routes/streamers"

const port = Number(process.env.PORT ?? 3001)

const app = new Elysia()
  .use(corsPlugin)
  .use(httpLogPlugin)
  .use(schedulesRoutes)
  .use(streamersRoutes)
  .use(clipsRoutes)
  .use(gamesRoutes)
  .use(feedbacksRoutes)
  .use(chzzkRoutes)
  .use(adminRoutes)
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
