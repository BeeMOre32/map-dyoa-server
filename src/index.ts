import * as Sentry from "@sentry/elysia"
import { Elysia } from "elysia"
import { sql } from "drizzle-orm"
import { db } from "./db"
import { adminRoutes } from "./routes/admin"
import { chzzkRoutes } from "./routes/chzzk"
import { corsPlugin } from "./plugins/cors"
import { feedbacksRoutes } from "./routes/feedbacks"
import { httpLogPlugin } from "./plugins/http-log"
import { requestTracePlugin } from "./plugins/request-trace"
import { clipsRoutes } from "./routes/clips"
import { gamesRoutes } from "./routes/games"
import { schedulesRoutes } from "./routes/schedules"
import { streamersRoutes } from "./routes/streamers"
import { logApi } from "./lib/server-log"
import { initSentryFromEnv, sentryShouldCaptureElysiaError } from "./lib/sentry-init"

initSentryFromEnv()

const port = Number(process.env.PORT ?? 3001)

const app = Sentry.withElysia(new Elysia(), {
  shouldHandleError: sentryShouldCaptureElysiaError,
})
  .use(corsPlugin)
  .use(requestTracePlugin)
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

if (process.env.SENTRY_DSN?.trim()) {
  const shutdown = () => {
    void Sentry.flush(2000).finally(() => process.exit(0))
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

logApi("boot", {
  listen: true,
  host: app.server?.hostname ?? "0.0.0.0",
  port: Number(app.server?.port ?? port),
})
