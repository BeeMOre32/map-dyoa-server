import { Elysia, t } from "elysia"
import { joinRoom, leaveRoom } from "../realtime/auction-hub"
import {
  buildRoomState,
  getFactionsByRoom,
  getRoomByCode,
  publishRoom,
  resolveRole,
} from "../services/auctions"
import { placeBid } from "../services/auctions-mutations"
import { logApi } from "../lib/server-log"

/**
 * 경매 실시간 채널. `/auctions/:code/ws?token=...`
 * - open: 방에 등록 후 역할(welcome)과 현재 상태(state) 전송
 * - message: { type: "bid", amount } 캡틴 호가 검증 → 성공 시 방 전체 broadcast
 * - close: 방에서 제거
 */
export const auctionWsRoutes = new Elysia().ws("/auctions/:code/ws", {
  query: t.Object({ token: t.Optional(t.String()) }),
  async open(ws) {
    const code = ws.data.params.code
    joinRoom(code, ws.raw)
    const room = await getRoomByCode(code)
    if (!room) {
      ws.send({ type: "error", reason: "ROOM_NOT_FOUND" })
      return
    }
    const factions = await getFactionsByRoom(room.id)
    const { role, factionId } = resolveRole(room, factions, ws.data.query.token)
    const state = await buildRoomState(room)
    ws.send({ type: "welcome", role, factionId })
    ws.send({ type: "state", state })
    logApi("auctions", { ws: "open", code, role })
  },
  async message(ws, message) {
    const code = ws.data.params.code
    const token = ws.data.query.token
    if (!message || typeof message !== "object") return
    const msg = message as { type?: string; amount?: number }

    if (msg.type === "ping") {
      ws.send({ type: "pong" })
      return
    }

    if (msg.type === "bid") {
      const room = await getRoomByCode(code)
      if (!room) {
        ws.send({ type: "reject", reason: "ROOM_NOT_FOUND" })
        return
      }
      const factions = await getFactionsByRoom(room.id)
      const { role, factionId } = resolveRole(room, factions, token)
      if (role !== "captain" || !factionId) {
        ws.send({ type: "reject", reason: "NOT_CAPTAIN" })
        return
      }
      const amount = Number(msg.amount)
      const result = await placeBid(code, factionId, amount)
      if (!result.ok) {
        ws.send({ type: "reject", reason: result.reason, amount })
        return
      }
      await publishRoom(code)
    }
  },
  close(ws) {
    leaveRoom(ws.data.params.code, ws.raw)
  },
})
