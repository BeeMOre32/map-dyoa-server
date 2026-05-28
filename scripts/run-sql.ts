/**
 * DATABASE_URL로 SQL 파일 실행 (마이그레이션 보조)
 * 사용: bun run scripts/run-sql.ts scripts/add-schedule-updated-at.sql
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"

const fileArg = process.argv[2]
if (!fileArg) {
  console.error("사용법: bun run scripts/run-sql.ts <sql-file>")
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL 환경 변수가 필요합니다.")
  process.exit(1)
}

const sqlPath = resolve(process.cwd(), fileArg)
const sql = readFileSync(sqlPath, "utf8")
const client = postgres(url, { max: 1 })

try {
  await client.unsafe(sql)
  console.log(`실행 완료: ${fileArg}`)
} finally {
  await client.end()
}
