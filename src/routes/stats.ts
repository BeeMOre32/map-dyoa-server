import { Elysia } from "elysia"
import { getPublicOverviewCounts } from "../services/admin-read"

export const statsRoutes = new Elysia({ prefix: "/stats" }).get("/overview", async () => {
  const counts = await getPublicOverviewCounts()
  return counts
})
