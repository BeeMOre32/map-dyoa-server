/**
 * map-dyoa `schedule-formatters.ts` 와 동일한 응답 형태 (Intl 기반 한국어 표기).
 */

export type GameDto = {
  id: string
  title: string
  isHoi4: boolean
}

export type StreamerDto = {
  id: string
  name: string
  handle: string
  generation: number
  role: string | null
  platform: string
  profileImg: string | null
  colorCode: string
  chzzkUrl: string | null
  youtubeUrl: string | null
  bio: string | null
  isGuest: boolean
  createdAt: Date
}

export type ParticipantFlat = StreamerDto & {
  nation: string | null
  result: string | null
  isGuest: boolean
}

export type FlattenedSchedule = {
  id: string
  title: string
  content: string | null
  gameId: string | null
  game: GameDto | null
  isGuerrilla: boolean
  isNaeJeon: boolean
  isLiveEnded: boolean
  liveUrls: string[]
  startTime: Date
  endTime: Date | null
  createdAt: Date
  participants: ParticipantFlat[]
  formattedDate: string
  formattedTime: string
}

type StreamerRow = {
  id: string
  name: string
  handle: string
  generation: number
  role: string | null
  platform: string
  profileImg: string | null
  colorCode: string
  chzzkUrl: string | null
  youtubeUrl: string | null
  bio: string | null
  isGuest: boolean
  createdAt: Date
}

export type ScheduleWithRelations = {
  id: string
  title: string
  content: string | null
  startTime: Date
  endTime: Date | null
  isGuerrilla: boolean
  isNaeJeon: boolean
  isLiveEnded: boolean
  liveUrls: string[]
  gameId: string | null
  createdAt: Date
  game: GameDto | null
  participants: Array<{
    nation: string | null
    result: string | null
    isGuest: boolean
    streamer: StreamerRow | null
  }>
}

function formatKoreanDate(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d)
}

function formatHHmm(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export function flattenScheduleParticipants(
  schedule: ScheduleWithRelations,
): FlattenedSchedule {
  const start = new Date(schedule.startTime)
  return {
    id: schedule.id,
    title: schedule.title ?? "",
    content: schedule.content,
    gameId: schedule.gameId,
    game: schedule.game,
    isGuerrilla: schedule.isGuerrilla,
    isNaeJeon: schedule.isNaeJeon,
    isLiveEnded: schedule.isLiveEnded,
    liveUrls: schedule.liveUrls ?? [],
    startTime: start,
    endTime: schedule.endTime ? new Date(schedule.endTime) : null,
    createdAt: new Date(schedule.createdAt),
    participants: schedule.participants
      .filter((p) => p.streamer != null)
      .map((p) => {
        const s = p.streamer!
        const row: ParticipantFlat = {
          id: s.id,
          name: s.name,
          handle: s.handle,
          generation: s.generation,
          role: s.role,
          platform: s.platform,
          profileImg: s.profileImg,
          colorCode: s.colorCode,
          chzzkUrl: s.chzzkUrl,
          youtubeUrl: s.youtubeUrl,
          bio: s.bio,
          isGuest: p.isGuest,
          createdAt: new Date(s.createdAt),
          nation: p.nation ?? null,
          result: p.result ?? null,
        }
        return row
      })
      .sort(
        (a, b) =>
          Number(a.isGuest) - Number(b.isGuest) ||
          a.name.localeCompare(b.name, "ko"),
      ),
    formattedDate: formatKoreanDate(start),
    formattedTime: formatHHmm(start),
  }
}

export function flattenSchedules(
  schedules: ScheduleWithRelations[],
): FlattenedSchedule[] {
  return schedules.map(flattenScheduleParticipants)
}
