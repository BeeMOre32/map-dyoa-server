import * as Sentry from "@sentry/elysia"
import { ZodError } from "zod"
import { getRequestId } from "./request-context"
import { pgCode, pgErrorFields } from "./pg-error"
import { logException, logWarn } from "./server-log"

export type MutationErrorOptions = {
  /** Fly/Loki 필터용, 예: `games.create` */
  scope: string
  duplicateMessage?: string
  fkMessage?: string
}

type MutationErrorBody =
  | { error: "VALIDATION"; issues: ReturnType<ZodError["flatten"]>; message?: string }
  | { error: "DUPLICATE_ENTRY"; message: string }
  | { error: "FK_VIOLATION"; message?: string }
  | { error: "INTERNAL"; message: string; requestId?: string }

/**
 * mutation 라우트 공통 오류 응답.
 * 500은 스택·pg 메타·requestId를 Fly JSON 로그에 남기고, Sentry DSN이 있으면 Issues에도 올립니다.
 */
export function mutationErrorResponse(
  e: unknown,
  set: { status?: number | string },
  opts: MutationErrorOptions,
): MutationErrorBody {
  const { scope, duplicateMessage, fkMessage } = opts

  if (e instanceof ZodError) {
    set.status = 400
    const issues = e.flatten()
    const first = e.issues[0]?.message
    logWarn("mutation_validation", {
      scope,
      issueCount: e.issues.length,
      ...(first ? { firstIssue: first } : {}),
    })
    return {
      error: "VALIDATION",
      issues,
      ...(first ? { message: first } : {}),
    }
  }

  const code = pgCode(e)
  if (code === "23505" && duplicateMessage) {
    set.status = 409
    logWarn("mutation_conflict", { scope, ...pgErrorFields(e) })
    return {
      error: "DUPLICATE_ENTRY",
      message: duplicateMessage,
    }
  }

  if (code === "23503") {
    set.status = 400
    logWarn("mutation_fk_violation", { scope, ...pgErrorFields(e) })
    return {
      error: "FK_VIOLATION",
      ...(fkMessage ? { message: fkMessage } : {}),
    }
  }

  set.status = 500
  logException(`mutation.${scope}`, e, {
    handled: true,
    ...pgErrorFields(e),
  })
  if (process.env.SENTRY_DSN?.trim()) {
    Sentry.captureException(e instanceof Error ? e : new Error(String(e)), {
      tags: { scope, handled: "mutation" },
    })
  }

  const message =
    e instanceof Error && e.message.trim()
      ? e.message.trim()
      : "서버 오류가 발생했습니다."
  const requestId = getRequestId()
  return {
    error: "INTERNAL",
    message,
    ...(requestId ? { requestId } : {}),
  }
}
