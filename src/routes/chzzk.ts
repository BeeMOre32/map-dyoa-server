import { Elysia } from "elysia"
import { getLiveStreamerIds } from "../services/chzzk-live-status"

export const chzzkRoutes = new Elysia({ prefix: "/chzzk" }).get(
  "/live-status",
  async () => {
    const liveStreamerIds = await getLiveStreamerIds()
    return { liveStreamerIds }
  },
)
