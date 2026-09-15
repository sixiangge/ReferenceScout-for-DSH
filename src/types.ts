export type PluginMode = 'suggest' | 'strict'
export type NetworkPolicy = 'always' | 'never'

export interface ReferenceScoutConfig {
  enabled: boolean
  autoTrigger: boolean
  mode: PluginMode
  intent: {
    skipSmallChanges: boolean
  }
  github: {
    maxCandidates: number
    hydrateTop: number
    selectTop: number
    timeoutMs: number
    maxRequests: number
    concurrency: number
    minStars: number
    tokenEnv: string
  }
  evidence: {
    allowCodeExcerpts: boolean
    maxFilesPerRepo: number
    maxTotalChars: number
    maxFileBytes: number
  }
  policy: {
    network: NetworkPolicy
    allowedLicenses: string[]
    allowArchived: boolean
    allowForks: boolean
    requirePinnedCommit: boolean
  }
  cacheTtlMs: number
  /** UI-written nonce used to invalidate the in-memory cache without exposing a Host RPC. */
  maintenanceEpoch: number
}

export interface TaskCard {
  task: string
  keywords: string[]
  language?: string
  codingIntent: boolean
}

export interface GitHubRepository {
  fullName: string
  htmlUrl: string
  description: string
  stars: number
  forks: number
  archived: boolean
  fork: boolean
  language: string | null
  license: string | null
  topics: string[]
  defaultBranch: string
  pushedAt: string
}

export interface RepositoryTreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
  size?: number
}

export interface ScoreBreakdown {
  taskMatch: number
  maintenance: number
  engineering: number
  architecture: number
  license: number
  community: number
  total: number
}

export interface EvidenceExcerpt {
  path: string
  text: string
}

export interface ReferenceCandidate {
  repository: GitHubRepository
  commitSha: string
  score: ScoreBreakdown
  signals: string[]
  evidencePaths: string[]
  excerpts: EvidenceExcerpt[]
}

export interface ExcludedCandidate {
  repository: string
  reason: string
}

export type ResearchStatus = 'completed' | 'no-results' | 'failed' | 'skipped' | 'disabled'

export interface ResearchResult {
  status: ResearchStatus
  task: TaskCard
  generatedAt: string
  selected: ReferenceCandidate[]
  excluded: ExcludedCandidate[]
  warnings: string[]
  brief: string
  cached: boolean
  error?: string
}

export interface ResearchOptions {
  signal?: AbortSignal
}
