import { cors } from "@elysiajs/cors"

/**
 * 브라우저 → API 크로스 오리진 허용.
 * `CORS_ORIGINS`에 쉼표로 구분해 넣으면 그 목록만 허용 (예: https://app.example.com).
 * 비우면 로컬 Next 기본값(localhost:3000 등)을 허용합니다.
 */
function allowedOriginList(): string[] {
  const raw =
    process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []
  if (raw.length > 0) return raw
  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ]
}

function isAllowedOrigin(origin: string): boolean {
  if (allowedOriginList().includes(origin)) return true
  try {
    const host = new URL(origin).hostname
    return host === "vercel.app" || host.endsWith(".vercel.app")
  } catch {
    return false
  }
}

export const corsPlugin = cors({
  origin: (request: Request) => {
    const origin = request.headers.get("origin")
    if (!origin) return true
    return isAllowedOrigin(origin)
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  credentials: true,
  maxAge: 86400,
  preflight: true,
})
