import { createHash } from "node:crypto"

const VOTER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeVoterId(raw: string): string | null {
  const id = raw.trim().toLowerCase()
  return VOTER_ID.test(id) ? id : null
}

/** 브라우저 식별자는 저장하지 않고 해시만 남긴다. */
export function voterKey(raw: string): string | null {
  const id = normalizeVoterId(raw)
  if (!id) return null
  return createHash("sha256").update(id).digest("hex")
}
