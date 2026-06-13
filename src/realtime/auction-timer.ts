/**
 * 방(code) 단위 라운드 자동 마감 타이머. 인메모리(단일 머신 기준).
 * 만료 시 등록된 핸들러(setExpireHandler)를 호출한다 — 순환 import를 피하려고 핸들러 주입 방식 사용.
 */

type ExpireHandler = (code: string) => void | Promise<void>

let expireHandler: ExpireHandler | null = null

export function setExpireHandler(handler: ExpireHandler): void {
  expireHandler = handler
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function clearRoomTimer(code: string): void {
  const t = timers.get(code)
  if (t) {
    clearTimeout(t)
    timers.delete(code)
  }
}

/** ms 후 라운드 자동 마감 예약(기존 예약은 대체) */
export function scheduleRoomClose(code: string, ms: number): void {
  clearRoomTimer(code)
  if (ms <= 0) return
  const t = setTimeout(() => {
    timers.delete(code)
    void expireHandler?.(code)
  }, ms)
  timers.set(code, t)
}
