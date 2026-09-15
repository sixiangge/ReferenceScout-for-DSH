import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import { defineTool, type PreToolDecision } from '@deepseek-ai/dsh-tools'
import { Config, DEFAULT_CONFIG, normalizeConfig } from './config.js'
import { buildTaskCard } from './intent.js'
import { ResearchLedger } from './ledger.js'
import { ResearchService } from './research-service.js'
import type { ReferenceScoutConfig, ResearchResult } from './types.js'

export { Config, DEFAULT_CONFIG, ResearchService }
export * from './types.js'

export const name = 'reference-scout'
export const inject = ['tools', 'commands']

const MUTATION_TOOLS = new Set(['write', 'edit', 'str_replace_editor', 'bash', 'pwsh'])
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

function agentKey(agent: Agent): string {
  return String(agent.id)
}

function messageText(message: UserMessage): string {
  return message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n').trim()
}

function lastUserText(messages: readonly UserMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.source.kind !== 'user') continue
    const text = messageText(message)
    if (text !== '') return text
  }
  return undefined
}

function toJson(value: ResearchResult): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function jsonBrief(value: JsonValue): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return JSON.stringify(value)
  const brief = value.brief
  return typeof brief === 'string' ? brief : JSON.stringify(value)
}

function skippedResult(text: string): ResearchResult {
  const task = { task: text.trim(), keywords: [], codingIntent: true }
  const base = {
    status: 'skipped' as const,
    task,
    generatedAt: new Date().toISOString(),
    selected: [],
    excluded: [],
    warnings: ['Research was explicitly skipped by the caller.'],
    cached: false,
  }
  return { ...base, brief: `Reference Scout: skipped\nResearch was explicitly skipped for this task.` }
}

function researchNotice(result: ResearchResult, trigger: 'automatic' | 'command') {
  return createUserMessage({
    content: [{ type: 'text', text: result.brief }],
    source: {
      kind: 'plugin',
      plugin: name,
      form: 'notice',
      summary: `Reference research ${result.status}: ${result.selected.length} selected`,
      referenceScout: { trigger, result: toJson(result) },
    },
  })
}

export function apply(ctx: Context, initialConfig: ReferenceScoutConfig = DEFAULT_CONFIG): void {
  let activeConfig = normalizeConfig(initialConfig)
  let configSource = (): ReferenceScoutConfig => activeConfig
  const service = new ResearchService(activeConfig)
  const ledger = new ResearchLedger()

  ctx.inject(['settings'], settingsCtx => {
    settingsCtx.settings.installSection(ctx, name, Config, activeConfig, {
      setSource(current) {
        configSource = current
      },
      onChange() {
        activeConfig = normalizeConfig(configSource())
        service.updateConfig(activeConfig)
      },
      validate(value) {
        if (value.github.selectTop > value.github.hydrateTop) throw new TypeError('github.selectTop must not exceed github.hydrateTop')
        if (value.github.hydrateTop > value.github.maxCandidates) throw new TypeError('github.hydrateTop must not exceed github.maxCandidates')
      },
    })
  })

  ctx.tools.register(defineTool({
    name: 'research_reference',
    description: 'Research high-quality public GitHub repositories for a coding task before implementation. Returns pinned references, evidence, scores, exclusions, and warnings. Use action=skip only with an explicit reason.',
    parameters: {
      query: { type: 'string', required: true, description: 'The current coding task, including language/framework and constraints.' },
      action: { type: 'string', enum: ['research', 'skip'], description: 'Run research or explicitly skip it.' },
      reason: { type: 'string', description: 'Required justification when action is skip.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: jsonBrief(value) }],
      presentationMeta: (_args, value) => ({ plugin: name, result: value }),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const key = exec.agent === undefined ? undefined : agentKey(exec.agent)
      if (args.action === 'skip') {
        if (args.reason === undefined || args.reason.trim() === '') throw new TypeError('reason is required when action is skip')
        const result = skippedResult(args.query)
        if (key !== undefined) ledger.record(key, args.query, result.status)
        return toJson(result)
      }
      if (key !== undefined) ledger.begin(key, args.query)
      const result = await service.research(args.query, { signal: exec.signal })
      if (key !== undefined) ledger.record(key, args.query, result.status)
      return toJson(result)
    },
  }))

  ctx.commands.register({
    name: 'reference',
    description: 'Run or explicitly skip Reference Scout research for this session.',
    input: { hint: '{"action":"research","query":"..."}' },
    recordInput: false,
    async handler(invocation): Promise<CommandResult> {
      let request: { action?: unknown; query?: unknown; reason?: unknown }
      try {
        request = JSON.parse(invocation.rawInput.trim()) as typeof request
      } catch {
        return { kind: 'error', text: 'Expected JSON: {"action":"research|skip","query":"...","reason":"..."}' }
      }
      const query = typeof request.query === 'string' ? request.query.trim() : ''
      if (query === '') return { kind: 'error', text: 'query is required' }
      let result: ResearchResult
      if (request.action === 'skip') {
        if (typeof request.reason !== 'string' || request.reason.trim() === '') return { kind: 'error', text: 'reason is required when action is skip' }
        result = skippedResult(query)
      } else if (request.action === 'research') {
        ledger.begin(agentKey(invocation.agent), query)
        try {
          result = await service.research(query, { signal: invocation.signal })
        } catch (error) {
          if (invocation.signal.aborted) return { kind: 'error', text: 'Reference research was cancelled.' }
          const message = error instanceof Error ? error.message : 'unknown research error'
          result = {
            status: 'failed', task: buildTaskCard(query, { skipSmallChanges: false }), generatedAt: new Date().toISOString(),
            selected: [], excluded: [], warnings: [], cached: false, error: message,
            brief: `Reference Scout: failed\nResearch failed safely: ${message}`,
          }
        }
      } else {
        return { kind: 'error', text: 'action must be research or skip' }
      }
      ledger.record(agentKey(invocation.agent), query, result.status)
      const event = invocation.agent.session.append('user/message', researchNotice(result, 'command'), { surfaceOp: 'append' })
      return { kind: 'success', text: result.brief, sourceEventSeq: event.seq }
    },
  })

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter' || !activeConfig.enabled || !activeConfig.autoTrigger || activeConfig.policy.network === 'never') return decision
    const text = lastUserText(decision.messages)
    if (text === undefined) return decision
    const task = buildTaskCard(text, activeConfig.intent)
    if (!task.codingIntent) return decision
    const key = agentKey(payload.agent)
    if (ledger.hasTerminal(key, text)) return decision
    ledger.begin(key, text)
    let result: ResearchResult
    try {
      result = await service.research(text, { signal: payload.signal })
    } catch (error) {
      if (payload.signal.aborted) return decision
      const message = error instanceof Error ? error.message : 'unknown research error'
      result = {
        status: 'failed',
        task,
        generatedAt: new Date().toISOString(),
        selected: [],
        excluded: [],
        warnings: [],
        cached: false,
        error: message,
        brief: `Reference Scout: failed\nResearch failed safely: ${message}`,
      }
    }
    ledger.record(key, text, result.status)
    const notice = researchNotice(result, 'automatic')
    return { ...decision, messages: [...decision.messages, notice] }
  })

  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const downstream = await next()
    if (downstream.kind !== 'allow' || activeConfig.mode !== 'strict' || !MUTATION_TOOLS.has(exec.name)) return downstream
    if (exec.agent === undefined) return { kind: 'deny', reason: 'Reference Scout strict mode requires an agent-bound research result before mutation.' }
    if (!ledger.permitsMutation(agentKey(exec.agent))) {
      return { kind: 'deny', reason: 'Reference Scout strict mode blocked this mutation: run research_reference first, or explicitly skip with a reason.' }
    }
    return downstream
  })
}
