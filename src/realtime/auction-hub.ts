/**
 * 경매 방(code) 단위 WebSocket 브로드캐스트 허브.
 * 단일 머신(min_machines_running=1) 기준의 인메모리 구현이다.
 * 다중 머신으로 확장하면 Postgres LISTEN/NOTIFY 또는 Redis pub/sub로 교체해야 한다.
 */

export type AuctionSocket = {
  /** Bun ServerWebSocket(=Elysia ws.raw) 등 문자열 전송 가능한 소켓 */
  send: (data: string) => unknown
}

const rooms = new Map<string, Set<AuctionSocket>>()

export function joinRoom(code: string, ws: AuctionSocket): void {
  let set = rooms.get(code)
  if (!set) {
    set = new Set()
    rooms.set(code, set)
  }
  set.add(ws)
}

export function leaveRoom(code: string, ws: AuctionSocket): void {
  const set = rooms.get(code)
  if (!set) return
  set.delete(ws)
  if (set.size === 0) rooms.delete(code)
}

export function roomSocketCount(code: string): number {
  return rooms.get(code)?.size ?? 0
}

export function broadcast(code: string, payload: unknown): void {
  const set = rooms.get(code)
  if (!set || set.size === 0) return
  const msg = typeof payload === "string" ? payload : JSON.stringify(payload)
  for (const ws of set) {
    try {
      ws.send(msg)
    } catch {
      // 끊긴 소켓은 close 핸들러에서 정리된다
    }
  }
}
