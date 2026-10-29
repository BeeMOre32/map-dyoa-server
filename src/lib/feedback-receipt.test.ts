import { describe, expect, test } from "bun:test"
import {
  createFeedbackReceipt,
  feedbackReceiptHash,
  feedbackReceiptMatches,
} from "./feedback-receipt"

describe("피드백 접수 토큰", () => {
  test("만든 토큰만 해시와 맞는다", () => {
    const receipt = createFeedbackReceipt()
    const hash = feedbackReceiptHash(receipt)
    expect(receipt).toHaveLength(43)
    expect(hash).toHaveLength(64)
    expect(feedbackReceiptMatches(receipt, hash)).toBe(true)
    expect(feedbackReceiptMatches(`${receipt.slice(0, -1)}a`, hash)).toBe(false)
    expect(feedbackReceiptMatches(receipt, null)).toBe(false)
  })
})