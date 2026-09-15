import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { apply, DEFAULT_CONFIG } from '../src/index.js'

function harness() {
  const listeners = new Map<string, (...args: unknown[]) => unknown>()
  const tools: ToolDefinition[] = []
  const commands: CommandDefinition[] = []
  const fakeContext = {
    tools: { register(tool: ToolDefinition) { tools.push(tool); return () => {} } },
    commands: { register(command: CommandDefinition) { commands.push(command); return () => {} } },
    inject() {},
    on(name: string, listener: (...args: unknown[]) => unknown) { listeners.set(name, listener); return () => {} },
  } as unknown as Context
  return { fakeContext, listeners, tools, commands }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('DSH host hooks', () => {
  it('does not auto-trigger without network and allows an explicit skip command to satisfy strict mode', async () => {
    const { fakeContext, listeners, tools, commands } = harness()
    const config = structuredClone(DEFAULT_CONFIG)
    config.mode = 'strict'
    config.policy.network = 'never'
    apply(fakeContext, config)

    expect(tools.map(tool => tool.name)).toContain('research_reference')
    expect(commands.map(command => command.name)).toContain('reference')
    const original = createUserMessage({ content: [{ type: 'text', text: '请实现一个 TypeScript 插件' }], source: { kind: 'user' } })
    const appended: unknown[] = []
    const agent = {
      id: 'agent-probe',
      session: { append(_type: string, data: unknown) { appended.push(data); return { seq: 17 } } },
    } as unknown as Agent
    const preStep = listeners.get('agent/pre-step')
    const decision = await preStep?.(
      { agent, messages: [original], turn: 0, step: 0, signal: new AbortController().signal },
      async () => ({ kind: 'enter', messages: [original], startsRequestSeries: true }),
    ) as { kind: string; messages: typeof original[] }
    expect(decision.messages).toEqual([original])

    const preExecute = listeners.get('tools/pre-execute')
    const execution = { name: 'write', agent, signal: new AbortController().signal }
    expect(await preExecute?.(execution, async () => ({ kind: 'allow' }))).toEqual(expect.objectContaining({ kind: 'deny' }))

    const command = commands.find(item => item.name === 'reference')
    const outcome = await command?.handler({
      commandId: 'command-1', agent,
      rawInput: ' {"action":"skip","query":"请实现一个 TypeScript 插件","reason":"已有内部实现"}',
      attachments: [], signal: new AbortController().signal,
    } as never)
    expect(outcome).toEqual(expect.objectContaining({ kind: 'success', sourceEventSeq: 17 }))
    expect(appended[0]).toEqual(expect.objectContaining({ source: expect.objectContaining({
      kind: 'plugin', plugin: 'reference-scout', referenceScout: expect.objectContaining({ trigger: 'command' }),
    }) }))
    expect(await preExecute?.(execution, async () => ({ kind: 'allow' }))).toEqual({ kind: 'allow' })
  })

  it('automatically researches the first explicit implementation request once and keeps structured metadata', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { fakeContext, listeners } = harness()
    apply(fakeContext, structuredClone(DEFAULT_CONFIG))
    const original = createUserMessage({ content: [{ type: 'text', text: '请实现一个带缓存的 TypeScript 搜索插件' }], source: { kind: 'user' } })
    const agent = { id: 'auto-agent' } as unknown as Agent
    const preStep = listeners.get('agent/pre-step')
    const next = async () => ({ kind: 'enter' as const, messages: [original], startsRequestSeries: true as const })
    const first = await preStep?.({ agent, messages: [original], turn: 0, step: 0, signal: new AbortController().signal }, next) as { messages: typeof original[] }
    expect(first.messages).toHaveLength(2)
    expect(first.messages[1]?.source).toEqual(expect.objectContaining({
      kind: 'plugin', plugin: 'reference-scout', form: 'notice',
      referenceScout: expect.objectContaining({ trigger: 'automatic', result: expect.objectContaining({ status: 'no-results' }) }),
    }))
    const requestsAfterFirstResearch = fetchMock.mock.calls.length
    expect(requestsAfterFirstResearch).toBe(2)
    const second = await preStep?.({ agent, messages: [original], turn: 0, step: 1, signal: new AbortController().signal }, next) as { messages: typeof original[] }
    expect(second.messages).toEqual([original])
    expect(fetchMock).toHaveBeenCalledTimes(requestsAfterFirstResearch)
  })
})
