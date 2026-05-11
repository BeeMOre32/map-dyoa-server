/** postgres / postgres.js 오류 코드 */
export function pgCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const c = (e as { code?: unknown }).code
    return typeof c === "string" ? c : undefined
  }
  return undefined
}
