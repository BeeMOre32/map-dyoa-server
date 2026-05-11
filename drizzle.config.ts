import { defineConfig } from "drizzle-kit"

/**
 * drizzle-kit introspect / generate / push 는 PgBouncer 트랜잭션 풀(예: Supabase :6543,
 * `pgbouncer=true`)에서 메타데이터 조회가 매우 느리거나 멈춘 것처럼 보일 수 있음.
 * Supabase 대시보드 → Database → Connection string → Direct(:5432) URI 를
 * `DRIZZLE_DATABASE_URL` 에 넣고 쓰면 됨. 없으면 `DATABASE_URL` 사용.
 */
const url =
  process.env.DRIZZLE_DATABASE_URL ?? process.env.DATABASE_URL

if (!url) {
  throw new Error(
    "DATABASE_URL 또는 DRIZZLE_DATABASE_URL 이 필요합니다 (drizzle-kit)",
  )
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
  strict: true,
})
