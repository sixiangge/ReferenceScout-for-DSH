/**
 * Public entry point of the package.
 *
 * @example
 * ```ts
 * import { AsyncTtlCache } from 'async-ttl-cache-benchmark'
 *
 * const cache = new AsyncTtlCache<string, User>({ ttlMs: 30_000, maxEntries: 500 })
 * const user = await cache.get(id, () => fetchUser(id))
 * ```
 */
export { AsyncTtlCache } from './async-ttl-cache.js'
export type { AsyncTtlCacheLoader, AsyncTtlCacheOptions } from './async-ttl-cache.js'
