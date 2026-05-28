import { z } from "zod"

/** map-dyoa `scheduleServerSchema` 와 동일 */
const participant = z.object({
  id: z.string(),
  nation: z.string().optional(),
  result: z.string().nullable().optional(),
  isGuest: z.boolean().optional(),
})

export const scheduleServerSchema = z.object({
  title: z.preprocess(
    (v) => (v === null || v === undefined ? "" : v),
    z.string().min(1, "방송 제목을 입력해주세요."),
  ),
  startTime: z.coerce
    .date()
    .refine((d) => !Number.isNaN(d.getTime()), "올바른 시간을 입력해주세요."),
  participants: z
    .array(participant)
    .min(1, "참여자를 최소 1명 이상 선택해주세요."),
  gameId: z.string().optional(),
  liveUrls: z.array(z.string()).optional(),
  isGuerrilla: z.boolean().optional(),
  isNaeJeon: z.boolean().optional(),
  isLiveEnded: z.boolean().optional(),
})

/** PATCH 전용 — 낙관적 동시성 revision */
export const scheduleUpdateSchema = scheduleServerSchema.extend({
  expectedUpdatedAt: z.coerce.date().optional(),
})

export type SchedulePayload = z.infer<typeof scheduleServerSchema>
export type ScheduleUpdatePayload = z.infer<typeof scheduleUpdateSchema>
