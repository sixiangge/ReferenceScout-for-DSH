import { describe, expect, it } from 'vitest'
import { parseResearchResult, referenceResearchDefinition, referenceResearchView } from '../src/client/data.js'

const result = {
  status: 'completed',
  task: { task: 'implement a TypeScript plugin', keywords: ['plugin'], codingIntent: true, language: 'TypeScript' },
  generatedAt: '2026-09-13T00:00:00.000Z',
  selected: [{
    repository: { fullName: 'owner/repo', htmlUrl: 'https://github.com/owner/repo', description: '', stars: 42, forks: 2, archived: false, fork: false, language: 'TypeScript', license: 'MIT', topics: [], defaultBranch: 'main', pushedAt: '2026-01-01T00:00:00Z' },
    commitSha: '0123456789abcdef',
    score: { taskMatch: 1, maintenance: 1, engineering: 1, architecture: 1, license: 1, community: 1, total: 6 },
    signals: ['tests'], evidencePaths: ['src/index.ts'], excerpts: [],
  }],
  excluded: [], warnings: [], brief: 'Reference Scout: completed', cached: false,
} as const

describe('client research projection', () => {
  it('rejects foreign metadata and accepts a complete research result', () => {
    expect(parseResearchResult({ status: 'completed' })).toBeNull()
    expect(parseResearchResult(result)).toEqual(result)
  })

  it('projects automatic notices and tool results into one ordered read-only snapshot', () => {
    const automatic = { type: 'user/message', seq: 2, time: 20, data: { id: 'm1', source: { kind: 'plugin', plugin: 'reference-scout', referenceScout: { trigger: 'automatic', result } } } } as never
    const tool = { type: 'tool/result', seq: 4, time: 40, data: { message: { source: { callId: 'c1' } }, meta: { plugin: 'reference-scout', result } } } as never
    const matchA = referenceResearchDefinition.match(automatic)
    const matchB = referenceResearchDefinition.match(tool)
    expect(matchA).toEqual({ id: 'm1', role: 'start' })
    expect(matchB).toEqual({ id: 'c1', role: 'start' })
    const stateA = referenceResearchDefinition.start({} as never, { event: automatic } as never, {} as never)
    const stateB = referenceResearchDefinition.start({} as never, { event: tool } as never, {} as never)
    const nodeA = referenceResearchDefinition.buildViewNode?.({ key: 'a', kind: '', id: 'm1', matches: [], start: undefined, state: stateA, current: new Map() })
    const nodeB = referenceResearchDefinition.buildViewNode?.({ key: 'b', kind: '', id: 'c1', matches: [], start: undefined, state: stateB, current: new Map() })
    const builder = referenceResearchView.create()
    const view = builder.replace({ nodes: [nodeB, nodeA] as never, timeline: {} as never })
    expect(view.records.map(item => item.origin)).toEqual(['automatic', 'tool'])
    expect(view.latest?.seq).toBe(4)
  })
})
