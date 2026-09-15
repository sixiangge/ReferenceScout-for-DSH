import type { GitHubRepository, RepositoryTreeEntry } from './types.js'

interface SearchResponse {
  incomplete_results?: boolean
  items?: unknown[]
}

interface GitHubClientOptions {
  token?: string
  timeoutMs: number
  maxRequests: number
  fetchImpl?: typeof fetch
}

export class GitHubApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'GitHubApiError'
  }
}

const API_ROOT = 'https://api.github.com'
const MAX_JSON_BYTES = 2_000_000

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new GitHubApiError('GitHub returned an unexpected response shape')
  return value as Record<string, unknown>
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function booleanValue(value: unknown): boolean {
  return value === true
}

function decodeBase64(content: string): Uint8Array {
  return Uint8Array.from(Buffer.from(content.replace(/\s/gu, ''), 'base64'))
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new GitHubApiError(`GitHub response exceeds ${maxBytes} bytes`, response.status)
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new GitHubApiError(`GitHub response exceeds ${maxBytes} bytes`, response.status)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

function encodeRepo(fullName: string): string {
  const parts = fullName.split('/')
  if (parts.length !== 2 || parts.some(part => !/^[\w.-]+$/u.test(part))) throw new GitHubApiError(`Invalid repository name: ${fullName}`)
  return parts.map(encodeURIComponent).join('/')
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export class GitHubClient {
  readonly #fetch: typeof fetch
  readonly #headers: HeadersInit
  #requestCount = 0

  constructor(private readonly options: GitHubClientOptions) {
    this.#fetch = options.fetchImpl ?? fetch
    this.#headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dsh-reference-scout/0.1.0',
      ...(options.token === undefined || options.token === '' ? {} : { Authorization: `Bearer ${options.token}` }),
    }
  }

  get requestCount(): number {
    return this.#requestCount
  }

  async #json(path: string, signal?: AbortSignal, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
    if (++this.#requestCount > this.options.maxRequests) throw new GitHubApiError(`GitHub request budget exceeded (${this.options.maxRequests})`)
    const timeout = AbortSignal.timeout(this.options.timeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const response = await this.#fetch(`${API_ROOT}${path}`, { headers: this.#headers, signal: combined })
    const text = await readLimitedText(response, maxBytes)
    if (!response.ok) {
      let message = text.slice(0, 300)
      try {
        const parsed = JSON.parse(text) as { message?: unknown }
        if (typeof parsed.message === 'string') message = parsed.message
      } catch {}
      throw new GitHubApiError(`GitHub API ${response.status}: ${message || response.statusText}`, response.status)
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new GitHubApiError('GitHub returned invalid JSON', response.status)
    }
  }

  async searchRepositories(query: string, limit: number, minStars: number, signal?: AbortSignal): Promise<{ repositories: GitHubRepository[]; incomplete: boolean }> {
    const qualifiers = [`stars:>=${Math.max(0, minStars)}`, 'is:public', 'mirror:false']
    const search = `${query} ${qualifiers.join(' ')}`.trim()
    const value = asRecord(await this.#json(`/search/repositories?q=${encodeURIComponent(search)}&sort=stars&order=desc&per_page=${Math.min(50, Math.max(1, limit))}`, signal)) as SearchResponse
    const repositories = (Array.isArray(value.items) ? value.items : []).map(item => {
      const repo = asRecord(item)
      const license = typeof repo.license === 'object' && repo.license !== null ? asRecord(repo.license) : undefined
      return {
        fullName: stringValue(repo.full_name),
        htmlUrl: stringValue(repo.html_url),
        description: stringValue(repo.description),
        stars: numberValue(repo.stargazers_count),
        forks: numberValue(repo.forks_count),
        archived: booleanValue(repo.archived),
        fork: booleanValue(repo.fork),
        language: typeof repo.language === 'string' ? repo.language : null,
        license: license === undefined ? null : (typeof license.spdx_id === 'string' ? license.spdx_id : null),
        topics: Array.isArray(repo.topics) ? repo.topics.filter((topic): topic is string => typeof topic === 'string').slice(0, 20) : [],
        defaultBranch: stringValue(repo.default_branch, 'main'),
        pushedAt: stringValue(repo.pushed_at),
      }
    }).filter(repo => repo.fullName !== '' && repo.htmlUrl.startsWith('https://github.com/'))
    return { repositories, incomplete: value.incomplete_results === true }
  }

  async getCommitSha(fullName: string, branch: string, signal?: AbortSignal): Promise<string> {
    const value = asRecord(await this.#json(`/repos/${encodeRepo(fullName)}/commits/${encodeURIComponent(branch)}`, signal))
    const sha = stringValue(value.sha)
    if (!/^[a-f0-9]{40}$/iu.test(sha)) throw new GitHubApiError(`GitHub returned an invalid commit SHA for ${fullName}`)
    return sha
  }

  async getReadme(fullName: string, ref: string, signal?: AbortSignal): Promise<string> {
    const value = asRecord(await this.#json(`/repos/${encodeRepo(fullName)}/readme?ref=${encodeURIComponent(ref)}`, signal, 1_000_000))
    const encoding = stringValue(value.encoding)
    const content = stringValue(value.content)
    if (encoding !== 'base64' || content === '') return ''
    const bytes = decodeBase64(content)
    if (bytes.byteLength > 500_000) throw new GitHubApiError(`README for ${fullName} is too large`)
    return new TextDecoder().decode(bytes)
  }

  async getTree(fullName: string, ref: string, signal?: AbortSignal): Promise<{ entries: RepositoryTreeEntry[]; truncated: boolean }> {
    const value = asRecord(await this.#json(`/repos/${encodeRepo(fullName)}/git/trees/${encodeURIComponent(ref)}?recursive=1`, signal))
    const entries = (Array.isArray(value.tree) ? value.tree : []).flatMap(item => {
      const entry = asRecord(item)
      const path = stringValue(entry.path)
      const type = stringValue(entry.type)
      if (path === '' || !['blob', 'tree', 'commit'].includes(type)) return []
      return [{ path, type: type as RepositoryTreeEntry['type'], ...(typeof entry.size === 'number' ? { size: entry.size } : {}) }]
    })
    return { entries, truncated: value.truncated === true }
  }

  async getFile(fullName: string, path: string, ref: string, maxBytes: number, signal?: AbortSignal): Promise<string> {
    const value = asRecord(await this.#json(`/repos/${encodeRepo(fullName)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, signal, Math.min(MAX_JSON_BYTES, maxBytes * 2 + 20_000)))
    if (stringValue(value.encoding) !== 'base64') throw new GitHubApiError(`Unsupported encoding for ${fullName}/${path}`)
    const bytes = decodeBase64(stringValue(value.content))
    if (bytes.byteLength > maxBytes) throw new GitHubApiError(`${fullName}/${path} exceeds ${maxBytes} bytes`)
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
}
