const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 이번 주 월요일의 KST 날짜. 집계 구간. */
export function kstWeekKey(now = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const weekday = kst.getUTCDay()
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1
  const monday = new Date(
    Date.UTC(
      kst.getUTCFullYear(),
      kst.getUTCMonth(),
      kst.getUTCDate() - daysSinceMonday,
    ),
  )
  const y = monday.getUTCFullYear()
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0")
  const d = String(monday.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** 이번 주 월요일 00:00 KST. */
export function kstWeekStartIso(now = new Date()): string {
  return new Date(`${kstWeekKey(now)}T00:00:00+09:00`).toISOString()
}
