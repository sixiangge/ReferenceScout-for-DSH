import { createHash } from 'node:crypto'
import type { ResearchResult } from './types.js'

interface LedgerEntry {
  hash: string
  status: ResearchResult['status'] | 'running'
}

export function taskHash(task: string): string {
  return createHash('sha256').update(task.trim().replace(/\s+/gu, ' ').toLowerCase()).digest('hex')
}

export class ResearchLedger {
  readonly #entries = new Map<string, LedgerEntry>()

  begin(agentId: string, task: string): string {
    const hash = taskHash(task)
    this.#entries.set(agentId, { hash, status: 'running' })
    return hash
  }

  record(agentId: string, task: string, status: ResearchResult['status']): void {
    this.#entries.set(agentId, { hash: taskHash(task), status })
  }

  status(agentId: string, task: string): LedgerEntry['status'] | undefined {
    const entry = this.#entries.get(agentId)
    return entry?.hash === taskHash(task) ? entry.status : undefined
  }

  hasTerminal(agentId: string, task: string): boolean {
    const status = this.status(agentId, task)
    return status !== undefined && status !== 'running'
  }

  permitsMutation(agentId: string): boolean {
    const status = this.#entries.get(agentId)?.status
    return status === 'completed' || status === 'no-results' || status === 'skipped'
  }

  clear(agentId: string): void {
    this.#entries.delete(agentId)
  }
}
