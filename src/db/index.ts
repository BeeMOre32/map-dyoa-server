import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error("DATABASE_URL 환경 변수가 필요함")
}

const max = Number(process.env.DB_POOL_MAX ?? 10)
const client = postgres(url, { max })

export const db = drizzle(client, { schema })
export { client, schema }
