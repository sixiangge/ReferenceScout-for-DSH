import { createHash } from 'node:crypto'
import { renderBrief } from './brief.js'
import { TtlCache } from './cache.js'
import { buildTaskCard } from './intent.js'
import { GitHubApiError, GitHubClient } from './github-client.js'
import { chooseEvidencePaths, sanitizeUntrustedText } from './security.js'
import { hardFilter, scoreRepository } from './scoring.js'
import type {
  ExcludedCandidate,
  GitHubRepository,
  ReferenceCandidate,
  ReferenceScoutConfig,
  RepositoryTreeEntry,
  ResearchOptions,
  ResearchResult,
} from './types.js'

interface HydratedRepository {
  repository: GitHubRepository
  commitSha: string
  readme: string
  tree: RepositoryTreeEntry[]
}

export interface ResearchServiceOptions {
  fetchImpl?: typeof fetch
  now?: () => number
  env?: NodeJS.ProcessEnv
}

async function mapLimit<T, U>(items: readonly T[], concurrency: number, mapper: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await mapper(items[index] as T, index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker))
  return output
}

function cacheKey(task: string, config: ReferenceScoutConfig): string {
  const relevant = {
    task: task.trim().replace(/\s+/gu, ' ').toLowerCase(),
    github: config.github,
    evidence: config.evidence,
    policy: config.policy,
  }
  return createHash('sha256').update(JSON.stringify(relevant)).digest('hex')
}

const QUERY_NOISE = new Set([
  'api', 'build', 'class', 'create', 'current', 'develop', 'export', 'file', 'index', 'implement',
  'implementation', 'project', 'src', 'test', 'tests', 'testing', 'unit',
  'typescript', 'javascript', 'python', 'rust', 'golang', 'java', 'kotlin', 'swift', 'php', 'ruby',
])
const CAPABILITY_HEADS = new Set(['app', 'api', 'adapter', 'cli', 'client', 'component', 'framework', 'library', 'middleware', 'plugin', 'sdk', 'server', 'tool', 'ui'])

function quoted(term: string): string {
  return `"${term.replace(/["\\]/gu, '')}"`
}

function searchableKeywords(task: ReturnType<typeof buildTaskCard>): string[] {
  const language = task.language?.toLowerCase()
  return task.keywords.filter(keyword => keyword.toLowerCase() !== language && !QUERY_NOISE.has(keyword.toLowerCase()))
}

function focusedCapabilityPair(task: ReturnType<typeof buildTaskCard>, keywords: readonly string[]): string[] {
  const words = task.task.toLowerCase().match(/[a-z][a-z0-9.+#-]{1,}/gu) ?? []
  const useful = words.filter(word => !QUERY_NOISE.has(word))
  for (let index = 1; index < useful.length; index++) {
    const head = useful[index]
    const modifier = useful[index - 1]
    if (
      head !== undefined
      && modifier !== undefined
      && CAPABILITY_HEADS.has(head)
      && keywords.includes(head)
      && keywords.includes(modifier)
      && modifier !== head
    ) return [modifier, head]
  }
  return keywords.slice(0, 2)
}

function queriesFor(task: ReturnType<typeof buildTaskCard>): string[] {
  const keywords = searchableKeywords(task)
  const preciseTerms = keywords.slice(0, 4)
  const relaxedTerms = focusedCapabilityPair(task, keywords)
  const withLanguage = (terms: readonly string[]): string => {
    const parts = terms.map(quoted)
    if (task.language !== undefined) parts.push(`language:${task.language}`)
    return parts.length === 0 ? task.task.slice(0, 120) : parts.join(' ')
  }
  return [...new Set([withLanguage(preciseTerms), withLanguage(relaxedTerms)])]
}

function resultWithBrief(result: Omit<ResearchResult, 'brief'>): ResearchResult {
  return { ...result, brief: renderBrief(result) }
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'request aborted'
  if (error instanceof GitHubApiError || error instanceof Error) return error.message.slice(0, 500)
  return 'unknown research error'
}

export class ResearchService {
  readonly #cache = new TtlCache<ResearchResult>()
  #config: ReferenceScoutConfig

  constructor(config: ReferenceScoutConfig, private readonly options: ResearchServiceOptions = {}) {
    this.#config = config
  }

  updateConfig(config: ReferenceScoutConfig): void {
    this.#config = config
    this.#cache.clear()
  }

  clearCache(): void {
    this.#cache.clear()
  }

  async research(text: string, options: ResearchOptions = {}): Promise<ResearchResult> {
    const config = this.#config
    const task = buildTaskCard(text)
    const generatedAt = new Date((this.options.now ?? Date.now)()).toISOString()
    if (!config.enabled || config.policy.network === 'never') {
      return resultWithBrief({ status: 'disabled', task, generatedAt, selected: [], excluded: [], warnings: [], cached: false })
    }

    const key = cacheKey(task.task, config)
    const cached = this.#cache.get(key)
    if (cached !== undefined) return { ...cached, cached: true }

    const env = this.options.env ?? process.env
    const token = env[config.github.tokenEnv]
    const client = new GitHubClient({
      ...(token === undefined ? {} : { token }),
      timeoutMs: config.github.timeoutMs,
      maxRequests: config.github.maxRequests,
      ...(this.options.fetchImpl === undefined ? {} : { fetchImpl: this.options.fetchImpl }),
    })
    const warnings: string[] = []
    const excluded: ExcludedCandidate[] = []

    try {
      const queries = queriesFor(task)
      let search = await client.searchRepositories(queries[0] as string, config.github.maxCandidates, config.github.minStars, options.signal)
      if (search.incomplete) warnings.push('GitHub marked the search result as incomplete.')
      const eligibleRepositories = (repositories: readonly GitHubRepository[]): GitHubRepository[] => repositories.filter(repository => {
        const reason = hardFilter(repository, task, config.policy)
        if (reason !== undefined) excluded.push({ repository: repository.fullName, reason })
        return reason === undefined
      })
      let eligible = eligibleRepositories(search.repositories)
      if (eligible.length === 0 && queries[1] !== undefined) {
        warnings.push('No eligible repositories matched the precise query; retried with a focused capability query.')
        search = await client.searchRepositories(queries[1], config.github.maxCandidates, config.github.minStars, options.signal)
        if (search.incomplete) warnings.push('GitHub marked the relaxed search result as incomplete.')
        eligible = eligibleRepositories(search.repositories)
      }
      eligible = eligible.slice(0, config.github.hydrateTop)

      const hydrated = await mapLimit(eligible, config.github.concurrency, async repository => {
        let commitSha = ''
        try {
          commitSha = await client.getCommitSha(repository.fullName, repository.defaultBranch, options.signal)
        } catch (error) {
          if (config.policy.requirePinnedCommit) {
            excluded.push({ repository: repository.fullName, reason: `could not pin commit: ${errorMessage(error)}` })
            return undefined
          }
          warnings.push(`${repository.fullName}: commit pin unavailable.`)
        }

        const ref = commitSha || repository.defaultBranch
        const [readmeOutcome, treeOutcome] = await Promise.allSettled([
          client.getReadme(repository.fullName, ref, options.signal),
          client.getTree(repository.fullName, ref, options.signal),
        ])
        const readme = readmeOutcome.status === 'fulfilled' ? sanitizeUntrustedText(readmeOutcome.value, 20_000) : ''
        const tree = treeOutcome.status === 'fulfilled' ? treeOutcome.value.entries : []
        if (readmeOutcome.status === 'rejected') warnings.push(`${repository.fullName}: README unavailable.`)
        if (treeOutcome.status === 'rejected') warnings.push(`${repository.fullName}: repository tree unavailable.`)
        if (treeOutcome.status === 'fulfilled' && treeOutcome.value.truncated) warnings.push(`${repository.fullName}: repository tree was truncated by GitHub.`)
        return { repository, commitSha: ref, readme, tree } satisfies HydratedRepository
      })

      const candidates: Array<ReferenceCandidate & { tree: RepositoryTreeEntry[] }> = hydrated.flatMap(item => {
        if (item === undefined) return []
        const scored = scoreRepository(item.repository, task, item.readme, item.tree, (this.options.now ?? Date.now)())
        return [{
          repository: item.repository,
          commitSha: item.commitSha,
          score: scored.score,
          signals: scored.signals,
          evidencePaths: chooseEvidencePaths(item.tree.filter(entry => entry.type === 'blob').map(entry => entry.path), config.evidence.maxFilesPerRepo),
          excerpts: [],
          tree: item.tree,
        }]
      }).sort((a, b) => b.score.total - a.score.total || b.repository.stars - a.repository.stars)

      const selected = candidates.slice(0, config.github.selectTop)
      if (config.evidence.allowCodeExcerpts) {
        let remaining = config.evidence.maxTotalChars
        for (const candidate of selected) {
          for (const path of candidate.evidencePaths) {
            if (remaining <= 0) break
            try {
              const raw = await client.getFile(candidate.repository.fullName, path, candidate.commitSha, config.evidence.maxFileBytes, options.signal)
              const text = sanitizeUntrustedText(raw, Math.min(remaining, 4_000))
              if (text !== '') {
                candidate.excerpts.push({ path, text })
                remaining -= text.length
              }
            } catch {
              warnings.push(`${candidate.repository.fullName}/${path}: evidence excerpt unavailable.`)
            }
          }
        }
      }

      const publicSelected: ReferenceCandidate[] = selected.map(({ tree: _tree, ...candidate }) => candidate)
      const base = {
        status: publicSelected.length === 0 ? 'no-results' as const : 'completed' as const,
        task,
        generatedAt,
        selected: publicSelected,
        excluded,
        warnings,
        cached: false,
      }
      const result = resultWithBrief(base)
      this.#cache.set(key, result, config.cacheTtlMs)
      return result
    } catch (error) {
      if (options.signal?.aborted === true) throw error
      return resultWithBrief({
        status: 'failed',
        task,
        generatedAt,
        selected: [],
        excluded,
        warnings,
        cached: false,
        error: errorMessage(error),
      })
    }
  }
}
