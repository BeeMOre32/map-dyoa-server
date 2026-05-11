import { Elysia, t } from "elysia"
import {
  getAdminClips,
  getAdminSchedules,
  getAdminStats,
  getHoi4Leaderboard,
  getRecentActivity,
} from "../services/admin-read"

export const adminRoutes = new Elysia({ prefix: "/admin" })
  .get("/stats", async () => getAdminStats())
  .get("/clips", async () => {
    const clips = await getAdminClips()
    return { clips }
  })
  .get(
    "/schedules",
    async ({ query }) => {
      const schedules = await getAdminSchedules({ from: query.from, to: query.to })
      return { schedules }
    },
    {
      query: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    },
  )
  .get("/recent-activity", async () => getRecentActivity())
  .get("/hoi4-leaderboard", async () => getHoi4Leaderboard())
