import { Elysia, t } from "elysia"
import { mutationErrorResponse } from "../lib/route-error"
import {
  listBongnudoProfiles,
  upsertBongnudoProfile,
} from "../services/bongnudo-profiles"

export const bongnudoRoutes = new Elysia({ prefix: "/bongnudo" })
  .get(
    "/profiles",
    async ({ query }) => {
      const profiles = await listBongnudoProfiles(query.season)
      return { profiles }
    },
    {
      query: t.Object({
        season: t.Optional(t.String()),
      }),
    },
  )
  .put("/profiles/:streamerId", async ({ params, body, set }) => {
    try {
      const profile = await upsertBongnudoProfile(params.streamerId, body)
      return { profile }
    } catch (e) {
      return mutationErrorResponse(e, set, {
        scope: "bongnudo.profiles.upsert",
        fkMessage: "등록된 스트리머가 아닙니다.",
      })
    }
  })
