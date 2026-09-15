import { describe, expect, it } from 'vitest'
import { ResearchLedger, taskHash } from '../src/ledger.js'
import { hardFilter, scoreRepository } from '../src/scoring.js'
import type { GitHubRepository, TaskCard } from '../src/types.js'

const task: TaskCard = {
  task: 'implement TypeScript cache plugin tests',
  keywords: ['cache', 'plugin', 'testing'],
  language: 'TypeScript',
  codingIntent: true,
}

const repository: GitHubRepository = {
  fullName: 'example/reference',
  htmlUrl: 'https://github.com/example/reference',
  description: 'A cache plugin with tests',
  stars: 10_000,
  forks: 100,
  archived: false,
  fork: false,
  language: 'TypeScript',
  license: 'MIT',
  topics: ['cache', 'plugin', 'testing'],
  defaultBranch: 'main',
  pushedAt: '2026-09-01T00:00:00Z',
}

describe('candidate policy and scoring', () => {
  it('hard-filters incompatible candidates', () => {
    expect(hardFilter(repository, task, { allowedLicenses: ['MIT'], allowArchived: false, allowForks: false })).toBeUndefined()
    expect(hardFilter({ ...repository, archived: true }, task, { allowedLicenses: ['MIT'], allowArchived: false, allowForks: false })).toBe('archived repository')
    expect(hardFilter({ ...repository, license: 'GPL-3.0' }, task, { allowedLicenses: ['MIT'], allowArchived: false, allowForks: false })).toMatch(/not allowed/u)
  })

  it('scores evidence across all declared dimensions', () => {
    const result = scoreRepository(repository, task, '# cache plugin testing', [
      { path: 'src/index.ts', type: 'blob' },
      { path: 'tests/index.test.ts', type: 'blob' },
      { path: '.github/workflows/ci.yml', type: 'blob' },
      { path: 'docs/architecture.md', type: 'blob' },
      { path: 'package.json', type: 'blob' },
    ], Date.parse('2026-09-12T00:00:00Z'))
    expect(result.score.total).toBeGreaterThan(85)
    expect(result.score).toEqual(expect.objectContaining({ license: 10, engineering: 15, architecture: 15 }))
  })
})

describe('strict-mode ledger', () => {
  it('permits mutation only after a terminal successful/no-result/skip state', () => {
    const ledger = new ResearchLedger()
    expect(taskHash(' A  Task ')).toBe(taskHash('a task'))
    ledger.begin('agent-1', 'a task')
    expect(ledger.permitsMutation('agent-1')).toBe(false)
    ledger.record('agent-1', 'a task', 'failed')
    expect(ledger.permitsMutation('agent-1')).toBe(false)
    ledger.record('agent-1', 'a task', 'no-results')
    expect(ledger.permitsMutation('agent-1')).toBe(true)
  })
})
