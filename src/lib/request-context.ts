import { AsyncLocalStorage } from "node:async_hooks"

type Store = { requestId: string }

const als = new AsyncLocalStorage<Store>()

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId
}

export function setRequestContext(requestId: string): void {
  als.enterWith({ requestId })
}
