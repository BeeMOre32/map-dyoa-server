import { expect, test } from "bun:test"
import { normalizeVoterId, voterKey } from "./clip-voter"

const ID = "6f1b1c2a-3d4e-4f5a-8b6c-7d8e9f001122"

test("올바른 식별자만 남긴다", () => {
  expect(normalizeVoterId(`  ${ID.toUpperCase()}  `)).toBe(ID)
  expect(normalizeVoterId("not-a-voter")).toBeNull()
  expect(normalizeVoterId("")).toBeNull()
})

test("같은 식별자는 같은 해시다", () => {
  const key = voterKey(ID)
  expect(key).toHaveLength(64)
  expect(voterKey(ID.toUpperCase())).toBe(key)
  expect(voterKey("nope")).toBeNull()
})
