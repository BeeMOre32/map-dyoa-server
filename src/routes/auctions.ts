import { Elysia, t } from "elysia"
import { mutationErrorResponse } from "../lib/route-error"
import { getAuctionHistoryByCode } from "../services/auction-history"
import {
  buildRoomState,
  getFactionsByRoom,
  getRoomByCode,
  listRoomsByScheduleId,
  publishRoom,
  resolveRole,
} from "../services/auctions"
import {
  createRoom,
  markSold,
  markUnsold,
  nominate,
  reorderNominees,
  setRoomStatus,
  startLot,
  undoLastBid,
  undoLastSold,
  type ControlResult,
} from "../services/auctions-mutations"

/** host 토큰 검증 후 mutation 실행 → 성공 시 broadcast + 새 상태 반환 */
async function runHostControl(
  code: string,
  token: string | undefined,
  action: () => Promise<ControlResult>,
  set: { status?: number | string },
) {
  const room = await getRoomByCode(code)
  if (!room) {
    set.status = 404
    return { error: "ROOM_NOT_FOUND" as const }
  }
  const factions = await getFactionsByRoom(room.id)
  const { role } = resolveRole(room, factions, token)
  if (role !== "host") {
    set.status = 403
    return { error: "FORBIDDEN" as const }
  }
  const result = await action()
  if (!result.ok) {
    set.status = 400
    return { error: result.reason }
  }
  const state = await publishRoom(code)
  return { ok: true as const, state }
}

export const auctionsRoutes = new Elysia({ prefix: "/auctions" })
  .post("/", async ({ body, set }) => {
    try {
      const result = await createRoom(body)
      set.status = 201
      return result
    } catch (e) {
      return mutationErrorResponse(e, set, { scope: "auctions.create" })
    }
  })
  .get("/by-schedule/:scheduleId", async ({ params }) => {
    const rooms = await listRoomsByScheduleId(params.scheduleId)
    return { scheduleId: params.scheduleId, rooms }
  })
  .get("/:code/history", async ({ params, set }) => {
    const result = await getAuctionHistoryByCode(params.code)
    if (!result) {
      set.status = 404
      return { error: "ROOM_NOT_FOUND" as const }
    }
    return result
  })
  .get(
    "/:code",
    async ({ params, query, set }) => {
      const room = await getRoomByCode(params.code)
      if (!room) {
        set.status = 404
        return { error: "ROOM_NOT_FOUND" as const }
      }
      const factions = await getFactionsByRoom(room.id)
      const { role, factionId } = resolveRole(room, factions, query.token)
      const state = await buildRoomState(room)
      return { role, factionId, state }
    },
    {
      query: t.Object({ token: t.Optional(t.String()) }),
    },
  )
  .get(
    "/:code/invite-links",
    async ({ params, query, set }) => {
      const room = await getRoomByCode(params.code)
      if (!room) {
        set.status = 404
        return { error: "ROOM_NOT_FOUND" as const }
      }
      const factions = await getFactionsByRoom(room.id)
      const { role } = resolveRole(room, factions, query.token)
      if (role !== "host") {
        set.status = 403
        return { error: "FORBIDDEN" as const }
      }
      return {
        captains: factions.map((f) => ({
          factionId: f.id,
          name: f.name,
          colorCode: f.colorCode,
          joinToken: f.joinToken,
        })),
      }
    },
    {
      query: t.Object({ token: t.String() }),
    },
  )
  .post(
    "/:code/nominate",
    async ({ params, body, set }) =>
      runHostControl(params.code, body.token, () => nominate(params.code, body.nomineeId), set),
    {
      body: t.Object({ token: t.String(), nomineeId: t.String() }),
    },
  )
  .post(
    "/:code/start-lot",
    async ({ params, body, set }) =>
      runHostControl(params.code, body.token, () => startLot(params.code), set),
    { body: t.Object({ token: t.String() }) },
  )
  .post(
    "/:code/sold",
    async ({ params, body, set }) =>
      runHostControl(params.code, body.token, () => markSold(params.code), set),
    { body: t.Object({ token: t.String() }) },
  )
  .post(
    "/:code/unsold",
    async ({ params, body, set }) =>
      runHostControl(params.code, body.token, () => markUnsold(params.code), set),
    { body: t.Object({ token: t.String() }) },
  )
  .post(
    "/:code/undo",
    async ({ params, body, set }) =>
      runHostControl(params.code, body.token, () => undoLastSold(params.code), set),
    { body: t.Object({ token: t.String() }) },
  )
  .post(
    "/:code/undo-bid",
    async ({ params, body, set }) =>
      runHostControl(params.code, body.token, () => undoLastBid(params.code), set),
    { body: t.Object({ token: t.String() }) },
  )
  .post(
    "/:code/status",
    async ({ params, body, set }) =>
      runHostControl(params.code, body.token, () => setRoomStatus(params.code, body.status), set),
    { body: t.Object({ token: t.String(), status: t.String() }) },
  )
  .post(
    "/:code/reorder-nominees",
    async ({ params, body, set }) =>
      runHostControl(
        params.code,
        body.token,
        () => reorderNominees(params.code, body.nomineeIds),
        set,
      ),
    {
      body: t.Object({
        token: t.String(),
        nomineeIds: t.Array(t.String()),
      }),
    },
  )
