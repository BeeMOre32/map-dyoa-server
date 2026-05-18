import { z } from "zod"

/** map-dyoa `streamerServerSchema` 와 동일 */
export const streamerServerSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요."),
  handle: z.string().min(1, "핸들을 입력해주세요."),
  generation: z.preprocess((val) => {
    const n = typeof val === "number" ? val : Number(val)
    if (!Number.isFinite(n) || n < 1) return 1
    return Math.floor(n)
  }, z.number().int().positive()),
  role: z.string().optional(),
  platform: z.string().default("CHZZK"),
  profileImg: z.string().trim().url().optional().or(z.literal("")),
  colorCode: z.string().default("#673AB7"),
  chzzkUrl: z.preprocess(
    (val) => (typeof val === "string" && !val.trim() ? undefined : val),
    z.string().optional(),
  ),
  youtubeUrl: z.preprocess(
    (val) => (typeof val === "string" && !val.trim() ? undefined : val),
    z
      .string()
      .refine(
        (s) => {
          try {
            const u = new URL(s)
            return u.protocol === "http:" || u.protocol === "https:"
          } catch {
            return false
          }
        },
        { message: "유튜브 주소는 https:// 로 시작하는 올바른 URL이어야 합니다." },
      )
      .optional(),
  ),
  bio: z.string().optional(),
  isGuest: z.boolean().optional(),
})

export type StreamerPayload = z.infer<typeof streamerServerSchema>
