import type {
  ConversationNodeDefinition, ConversationViewDefinition, ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ResearchResult } from '../types.js'

export type ResearchOrigin = 'automatic' | 'command' | 'tool'

export interface ReferenceResearchRecord {
  readonly id: string
  readonly seq: number
  readonly time: number
  readonly origin: ResearchOrigin
  readonly result: ResearchResult
}

export interface ReferenceScoutViewSnapshot {
  readonly records: readonly ReferenceResearchRecord[]
  readonly latest: ReferenceResearchRecord | null
}

interface ReferenceScoutNode extends ConversationViewNode {
  readonly target: 'reference-scout'
  readonly data: ReferenceResearchRecord
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationViewSnapshotMap {
    'reference-scout': ReferenceScoutViewSnapshot
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null
}

/** Strict enough to keep corrupt/foreign event metadata out of the presentation layer. */
export function parseResearchResult(value: unknown): ResearchResult | null {
  const root = record(value)
  const task = record(root?.task)
  const statuses = new Set(['completed', 'no-results', 'failed', 'skipped', 'disabled'])
  if (root === null || task === null || typeof root.status !== 'string' || !statuses.has(root.status)) return null
  if (typeof task.task !== 'string' || stringArray(task.keywords) === null || typeof task.codingIntent !== 'boolean') return null
  if (typeof root.generatedAt !== 'string' || typeof root.brief !== 'string' || typeof root.cached !== 'boolean') return null
  if (!Array.isArray(root.selected) || !Array.isArray(root.excluded) || stringArray(root.warnings) === null) return null
  for (const candidate of root.selected) {
    const item = record(candidate)
    const repository = record(item?.repository)
    const score = record(item?.score)
    if (item === null || repository === null || score === null) return null
    if (typeof repository.fullName !== 'string' || typeof repository.htmlUrl !== 'string' || typeof repository.stars !== 'number') return null
    if (typeof item.commitSha !== 'string' || typeof score.total !== 'number') return null
    if (stringArray(item.signals) === null || stringArray(item.evidencePaths) === null || !Array.isArray(item.excerpts)) return null
  }
  for (const excluded of root.excluded) {
    const item = record(excluded)
    if (item === null || typeof item.repository !== 'string' || typeof item.reason !== 'string') return null
  }
  return value as ResearchResult
}

function fromEvent(event: { type: string; seq: number; time: number; data: unknown }): ReferenceResearchRecord | null {
  const data = record(event.data)
  if (data === null) return null
  if (event.type === 'user/message') {
    const source = record(data.source)
    const scout = record(source?.referenceScout)
    const result = parseResearchResult(scout?.result)
    const trigger = scout?.trigger
    if (source?.kind !== 'plugin' || source.plugin !== 'reference-scout' || result === null) return null
    if (trigger !== 'automatic' && trigger !== 'command') return null
    return { id: String(data.id ?? event.seq), seq: event.seq, time: event.time, origin: trigger, result }
  }
  if (event.type === 'tool/result') {
    const meta = record(data.meta)
    const message = record(data.message)
    const source = record(message?.source)
    const result = parseResearchResult(meta?.result)
    if (meta?.plugin !== 'reference-scout' || result === null) return null
    return { id: String(source?.callId ?? event.seq), seq: event.seq, time: event.time, origin: 'tool', result }
  }
  return null
}

export const referenceResearchDefinition: ConversationNodeDefinition<ReferenceResearchRecord> = {
  kind: 'reference-scout-result',
  target: 'reference-scout',
  match(event) {
    const result = fromEvent(event)
    return result === null ? null : { id: result.id, role: 'start' }
  },
  start(_context, match) {
    const result = fromEvent(match.event)
    if (result === null) throw new Error('reference-scout start requires structured research metadata')
    return result
  },
  update(context) {
    if (context.state === undefined) throw new Error('reference-scout update requires state')
    return context.state
  },
  buildViewNode(context) {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'reference-scout-result',
      id: context.id,
      target: 'reference-scout',
      data: context.state,
    }
  },
}

function snapshot(nodes: readonly ReferenceScoutNode[]): ReferenceScoutViewSnapshot {
  const records = nodes.map(node => node.data).sort((left, right) => left.seq - right.seq)
  return { records, latest: records.at(-1) ?? null }
}

export const referenceResearchView: ConversationViewDefinition<ReferenceScoutNode, ReferenceScoutViewSnapshot> = {
  target: 'reference-scout',
  create() {
    let nodes = new Map<string, ReferenceScoutNode>()
    return {
      empty: { records: [], latest: null },
      replace(input) {
        nodes = new Map(input.nodes.map(node => [node.key, node]))
        return snapshot([...nodes.values()])
      },
      apply(input) {
        for (const node of input.upserts) nodes.set(node.key, node)
        return snapshot([...nodes.values()])
      },
    }
  },
  isActive(value) {
    return value.records.length > 0
  },
}
