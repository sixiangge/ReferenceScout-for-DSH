import type { GitHubRepository, RepositoryTreeEntry, ScoreBreakdown, TaskCard } from './types.js'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

export function hardFilter(repository: GitHubRepository, task: TaskCard, options: { allowedLicenses: string[]; allowArchived: boolean; allowForks: boolean }): string | undefined {
  if (!options.allowArchived && repository.archived) return 'archived repository'
  if (!options.allowForks && repository.fork) return 'fork repository'
  if (repository.license === null || repository.license === 'NOASSERTION') return 'license is missing or unknown'
  if (!options.allowedLicenses.some(item => item.toLowerCase() === repository.license?.toLowerCase())) return `license ${repository.license} is not allowed`
  if (task.language !== undefined && repository.language !== null && task.language.toLowerCase() !== repository.language.toLowerCase()) return `language ${repository.language} does not match ${task.language}`
  return undefined
}

export function scoreRepository(repository: GitHubRepository, task: TaskCard, readme: string, tree: readonly RepositoryTreeEntry[], now = Date.now()): { score: ScoreBreakdown; signals: string[] } {
  const corpus = `${repository.fullName} ${repository.description} ${repository.topics.join(' ')} ${readme.slice(0, 12_000)}`.toLowerCase()
  const matched = task.keywords.filter(keyword => corpus.includes(keyword.toLowerCase()))
  const taskMatch = task.keywords.length === 0 ? 8 : clamp((matched.length / task.keywords.length) * 35, 0, 35)

  const pushed = Date.parse(repository.pushedAt)
  const ageDays = Number.isFinite(pushed) ? Math.max(0, (now - pushed) / 86_400_000) : 1_095
  const maintenance = clamp(15 * (1 - ageDays / 730), 0, 15)

  const paths = tree.map(entry => entry.path.toLowerCase())
  const hasTests = paths.some(path => /(?:^|\/)(?:test|tests|spec|specs)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path))
  const hasCi = paths.some(path => path.startsWith('.github/workflows/') || /(?:^|\/)(?:gitlab-ci\.yml|circleci|azure-pipelines\.yml)$/u.test(path))
  const hasManifest = paths.some(path => /(?:^|\/)(?:package\.json|pyproject\.toml|cargo\.toml|go\.mod|pom\.xml|build\.gradle)$/u.test(path))
  const hasDocs = paths.some(path => /(?:^|\/)(?:docs?|examples?)(?:\/|$)/u.test(path))
  const engineering = (hasTests ? 5 : 0) + (hasCi ? 4 : 0) + (hasManifest ? 3 : 0) + (hasDocs ? 3 : 0)

  const hasSource = paths.some(path => /(?:^|\/)(?:src|lib|packages|apps)(?:\/|$)/u.test(path))
  const hasArchitecture = paths.some(path => /(?:architecture|design|adr|rfcs?)/u.test(path))
  const directoryCount = new Set(paths.map(path => path.split('/')[0]).filter(Boolean)).size
  const architecture = (hasSource ? 7 : 0) + (hasArchitecture ? 5 : 0) + (directoryCount >= 4 ? 3 : 0)

  const license = repository.license === null ? 0 : 10
  const community = clamp(Math.log10(repository.stars + 1) * 2, 0, 10)
  const score = {
    taskMatch: round(taskMatch),
    maintenance: round(maintenance),
    engineering: round(engineering),
    architecture: round(architecture),
    license: round(license),
    community: round(community),
    total: round(taskMatch + maintenance + engineering + architecture + license + community),
  }
  const signals = [
    matched.length > 0 ? `matched: ${matched.join(', ')}` : 'no explicit keyword match',
    hasTests ? 'tests present' : 'tests not detected',
    hasCi ? 'CI present' : 'CI not detected',
    hasArchitecture ? 'architecture documentation present' : 'architecture documentation not detected',
    `${repository.stars} stars`,
  ]
  return { score, signals }
}
