import * as Sentry from "@sentry/elysia"
import { initSentryFromEnv } from "../src/lib/sentry-init"

initSentryFromEnv()

const dsn = process.env.SENTRY_DSN?.trim()
if (!dsn) {
  console.error("SENTRY_DSN이 없습니다. .env 또는 환경 변수에 DSN을 넣은 뒤 다시 실행하세요.")
  process.exit(1)
}

const err = new Error(
  "[map-dyoa-server] Sentry 연동 확인 — Issues에서 확인 후 resolve 하면 됩니다.",
)
Sentry.captureException(err)
await Sentry.flush(3000)
console.log("Sentry로 이벤트를 보냈습니다. 대시보드 Issues에서 위 메시지 오류를 확인하세요.")
