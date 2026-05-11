type LogFields = Record<string, string | number | boolean | undefined>

function formatFields(fields: LogFields): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")
}

/** 일정·참가자(ScheduleParticipant) 조회 등 */
export function logSchedules(scope: string, fields: LogFields): void {
  console.log(`[schedules] ${scope} ${formatFields(fields)}`)
}

/** 모든 HTTP 요청 한 줄 요약 */
export function logHttp(
  method: string,
  pathname: string,
  search: string,
  status: number,
  ms: number,
): void {
  const q = search && search !== "" ? search : ""
  console.log(`[http] ${method} ${pathname}${q} ${status} ${ms}ms`)
}
