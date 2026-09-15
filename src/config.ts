import z from '@deepseek-ai/schemastery'
import type { ReferenceScoutConfig } from './types.js'

export const DEFAULT_CONFIG: ReferenceScoutConfig = {
  enabled: true,
  autoTrigger: true,
  mode: 'suggest',
  intent: {
    skipSmallChanges: true,
  },
  github: {
    maxCandidates: 10,
    hydrateTop: 5,
    selectTop: 3,
    timeoutMs: 15_000,
    maxRequests: 20,
    concurrency: 3,
    minStars: 5,
    tokenEnv: 'GITHUB_TOKEN',
  },
  evidence: {
    allowCodeExcerpts: false,
    maxFilesPerRepo: 3,
    maxTotalChars: 12_000,
    maxFileBytes: 100_000,
  },
  policy: {
    network: 'always',
    allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0'],
    allowArchived: false,
    allowForks: false,
    requirePinnedCommit: true,
  },
  cacheTtlMs: 15 * 60_000,
  maintenanceEpoch: 0,
}

export const Config: z<ReferenceScoutConfig> = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled),
  autoTrigger: z.boolean().default(DEFAULT_CONFIG.autoTrigger),
  mode: z.union(['suggest', 'strict']).default(DEFAULT_CONFIG.mode),
  intent: z.object({
    skipSmallChanges: z.boolean().default(DEFAULT_CONFIG.intent.skipSmallChanges),
  }),
  github: z.object({
    maxCandidates: z.number().step(1).min(1).max(50).default(DEFAULT_CONFIG.github.maxCandidates),
    hydrateTop: z.number().step(1).min(1).max(20).default(DEFAULT_CONFIG.github.hydrateTop),
    selectTop: z.number().step(1).min(1).max(10).default(DEFAULT_CONFIG.github.selectTop),
    timeoutMs: z.number().step(1).min(1_000).max(120_000).default(DEFAULT_CONFIG.github.timeoutMs),
    maxRequests: z.number().step(1).min(1).max(100).default(DEFAULT_CONFIG.github.maxRequests),
    concurrency: z.number().step(1).min(1).max(8).default(DEFAULT_CONFIG.github.concurrency),
    minStars: z.number().step(1).min(0).default(DEFAULT_CONFIG.github.minStars),
    tokenEnv: z.string().default(DEFAULT_CONFIG.github.tokenEnv),
  }),
  evidence: z.object({
    allowCodeExcerpts: z.boolean().default(DEFAULT_CONFIG.evidence.allowCodeExcerpts),
    maxFilesPerRepo: z.number().step(1).min(0).max(10).default(DEFAULT_CONFIG.evidence.maxFilesPerRepo),
    maxTotalChars: z.number().step(1).min(1_000).max(100_000).default(DEFAULT_CONFIG.evidence.maxTotalChars),
    maxFileBytes: z.number().step(1).min(1_000).max(1_000_000).default(DEFAULT_CONFIG.evidence.maxFileBytes),
  }),
  policy: z.object({
    network: z.union(['always', 'never']).default(DEFAULT_CONFIG.policy.network),
    allowedLicenses: z.array(z.string()).default(DEFAULT_CONFIG.policy.allowedLicenses),
    allowArchived: z.boolean().default(DEFAULT_CONFIG.policy.allowArchived),
    allowForks: z.boolean().default(DEFAULT_CONFIG.policy.allowForks),
    requirePinnedCommit: z.boolean().default(DEFAULT_CONFIG.policy.requirePinnedCommit),
  }),
  cacheTtlMs: z.number().step(1).min(0).max(24 * 60 * 60_000).default(DEFAULT_CONFIG.cacheTtlMs),
  maintenanceEpoch: z.number().step(1).min(0).default(DEFAULT_CONFIG.maintenanceEpoch),
})

export function normalizeConfig(input: ReferenceScoutConfig): ReferenceScoutConfig {
  const maxCandidates = Math.max(1, input.github.maxCandidates)
  const hydrateTop = Math.min(maxCandidates, Math.max(1, input.github.hydrateTop))
  const selectTop = Math.min(hydrateTop, Math.max(1, input.github.selectTop))
  return {
    ...input,
    github: { ...input.github, maxCandidates, hydrateTop, selectTop },
    policy: { ...input.policy, allowedLicenses: [...new Set(input.policy.allowedLicenses.map(item => item.trim()).filter(Boolean))] },
  }
}
