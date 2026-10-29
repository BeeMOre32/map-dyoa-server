import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

const RECEIPT = /^[A-Za-z0-9_-]{43}$/

export function createFeedbackReceipt(): string {
  return randomBytes(32).toString("base64url")
}

export function feedbackReceiptHash(receipt: string): string | null {
  const value = receipt.trim()
  if (!RECEIPT.test(value)) return null
  return createHash("sha256").update(value).digest("hex")
}

export function feedbackReceiptMatches(receipt: string, storedHash: string | null): boolean {
  const hash = feedbackReceiptHash(receipt)
  if (!hash || !storedHash || storedHash.length !== hash.length) return false
  return timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash))
}
