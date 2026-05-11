import { z } from "zod"

/** map-dyoa `clipServerSchema` 와 동일 */
export const clipServerSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요."),
  url: z.string().min(1, "클립 URL을 입력해주세요."),
  streamerIds: z
    .array(z.string())
    .min(1, "연관된 스트리머를 최소 1명 선택해주세요."),
  thumbnailUrl: z.string().optional(),
  description: z.string().optional(),
  clipDate: z.coerce.date().nullable().optional(),
  scheduleId: z.string().optional(),
})

export type ClipPayload = z.infer<typeof clipServerSchema>
