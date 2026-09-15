/**
 * An asynchronous, in-memory cache with per-entry time-to-live and a
 * least-recently-used capacity bound.
 *
 * Values are produced on demand by a loader and are stored once the load
 * succeeds:
 *
 * - **Fresh hits** are returned without touching the loader and count as a use
 *   for LRU purposes.
 * - **Concurrent misses** for the same key share one in-flight load, so the
 *   loader is invoked at most once per load.
 * - **Failed loads** are never cached: the rejection reaches every waiting
 *   caller and the next `get` retries the loader.
 * - **`delete`/`clear`/`set`** during a load disown its result, so a late
 *   resolution can never repopulate a key that was removed or overwritten.
 *
 * @example
 * ```ts
 * const cache = new AsyncTtlCache<string, User>({ ttlMs: 30_000, maxEntries: 500 })
 * const user = await cache.get(id, () => fetchUser(id))
 * ```
 */

/** Configuration accepted by {@link AsyncTtlCache}. */
export interface AsyncTtlCacheOptions {
  /**
   * Lifetime of a stored value in milliseconds, measured from the moment it
   * was stored. `0` expires values immediately. Must be a non-negative finite
   * number.
   */
  ttlMs: number
  /**
   * Maximum number of fresh entries retained. When the limit is exceeded,
   * expired entries are reclaimed first and the least recently used live entry
   * is evicted next. `0` disables caching entirely. Must be a non-negative
   * integer.
   */
  maxEntries: number
  /**
   * Clock in milliseconds used for expiry checks, defaulting to `Date.now`.
   * Inject a deterministic clock in tests to control expiry.
   */
  now?: () => number
}

/**
 * Produces the value for a cache miss. May return the value directly or a
 * promise for it; a synchronous throw is treated like a rejected load.
 */
export type AsyncTtlCacheLoader<V> = () => V | Promise<V>

/** A stored value together with the time at which it goes stale. */
interface CacheEntry<V> {
  readonly value: V
  /** Absolute cache-clock time at which this entry is no longer fresh. */
  readonly expiresAt: number
}

/** Shared flag that lets `delete`, `clear`, and `set` disown a pending load. */
interface LoadToken {
  cancelled: boolean
}

/** A load in progress; every concurrent `get` for the key awaits this promise. */
interface InFlightLoad<V> {
  readonly promise: Promise<V>
  readonly token: LoadToken
}

export class AsyncTtlCache<K, V> {
  readonly #ttlMs: number
  readonly #maxEntries: number
  readonly #now: () => number

  /** Fresh entries in least-recently-used order: the first key is the oldest. */
  readonly #entries = new Map<K, CacheEntry<V>>()

  /** Loads in progress, keyed by cache key. */
  readonly #inFlight = new Map<K, InFlightLoad<V>>()

  /**
   * @param options Cache configuration.
   * @throws {RangeError} If `ttlMs` is not a non-negative finite number or
   * `maxEntries` is not a non-negative integer.
   */
  constructor(options: AsyncTtlCacheOptions) {
    if (!Number.isFinite(options.ttlMs) || options.ttlMs < 0) {
      throw new RangeError(
        `AsyncTtlCache: ttlMs must be a non-negative finite number, received ${String(options.ttlMs)}`,
      )
    }
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 0) {
      throw new RangeError(
        `AsyncTtlCache: maxEntries must be a non-negative integer, received ${String(options.maxEntries)}`,
      )
    }

    this.#ttlMs = options.ttlMs
    this.#maxEntries = options.maxEntries
    this.#now = options.now ?? Date.now
  }

  /** Number of fresh entries held. Expired entries are not counted. */
  get size(): number {
    const now = this.#now()
    let live = 0
    for (const entry of this.#entries.values()) {
      if (entry.expiresAt > now) live += 1
    }
    return live
  }

  /**
   * Returns the value cached for `key`, falling back to `loader` on a miss or
   * once the stored value has expired.
   *
   * Calls that arrive while a load for the same key is still in flight receive
   * that load's promise, so `loader` runs at most once per load. A rejected
   * load is dropped rather than cached, and its error propagates to every
   * caller awaiting it.
   *
   * @param key Cache key.
   * @param loader Loader invoked on a miss; may be synchronous.
   * @returns The fresh value, or the value produced by `loader`.
   */
  get(key: K, loader: AsyncTtlCacheLoader<V>): Promise<V> {
    const entry = this.#freshEntry(key)
    if (entry !== undefined) {
      this.#touch(key, entry)
      return Promise.resolve(entry.value)
    }

    const pending = this.#inFlight.get(key)
    if (pending !== undefined) return pending.promise

    return this.#startLoad(key, loader)
  }

  /**
   * Stores `value` under `key` for the configured TTL.
   *
   * An explicit write supersedes any load still in flight for the key: the
   * late result of that load is discarded rather than overwriting `value`.
   */
  set(key: K, value: V): void {
    this.#cancelLoad(key)
    this.#store(key, value)
  }

  /** Whether a fresh, unexpired value is cached for `key`. */
  has(key: K): boolean {
    return this.#freshEntry(key) !== undefined
  }

  /**
   * Removes the cached value for `key` and cancels a load still in flight for
   * it, so a later resolution cannot repopulate the key.
   *
   * @returns `true` if a cached value or a pending load was removed.
   */
  delete(key: K): boolean {
    const cancelled = this.#cancelLoad(key)
    const removed = this.#entries.delete(key)
    return removed || cancelled
  }

  /**
   * Removes every cached value and cancels every load in flight, so no pending
   * load can repopulate the cache.
   */
  clear(): void {
    for (const pending of this.#inFlight.values()) pending.token.cancelled = true
    this.#inFlight.clear()
    this.#entries.clear()
  }

  /**
   * Starts a load and registers it as in-flight *before* invoking `loader`, so
   * even a loader that throws synchronously cannot strand an in-flight record
   * and wedge the key.
   */
  #startLoad(key: K, loader: AsyncTtlCacheLoader<V>): Promise<V> {
    const token: LoadToken = { cancelled: false }
    let fulfil!: (value: V) => void
    let fail!: (error: unknown) => void
    const promise = new Promise<V>((resolve, reject) => {
      fulfil = resolve
      fail = reject
    })
    this.#inFlight.set(key, { promise, token })

    void (async () => {
      try {
        const value = await loader()
        if (!token.cancelled) this.#store(key, value)
        fulfil(value)
      } catch (error) {
        fail(error)
      } finally {
        // Only the load that still owns the key may deregister itself.
        if (this.#inFlight.get(key)?.token === token) this.#inFlight.delete(key)
      }
    })()

    return promise
  }

  /** Cancels the pending load for `key`, if any, and reports whether one existed. */
  #cancelLoad(key: K): boolean {
    const pending = this.#inFlight.get(key)
    if (pending === undefined) return false
    pending.token.cancelled = true
    this.#inFlight.delete(key)
    return true
  }

  /** Returns the entry for `key` if it is still fresh, dropping it once expired. */
  #freshEntry(key: K): CacheEntry<V> | undefined {
    const entry = this.#entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= this.#now()) {
      // Lazy expiry: stale entries are discarded the first time they are seen.
      this.#entries.delete(key)
      return undefined
    }
    return entry
  }

  /** Stores `value` and enforces the capacity bound. */
  #store(key: K, value: V): void {
    this.#touch(key, { value, expiresAt: this.#now() + this.#ttlMs })
    this.#evictOverflow()
  }

  /** Marks `key` as the most recently used entry. */
  #touch(key: K, entry: CacheEntry<V>): void {
    // Re-inserting moves the key to the end of the Map's iteration order.
    this.#entries.delete(key)
    this.#entries.set(key, entry)
  }

  /** Reclaims expired entries, then evicts least-recently-used ones, until within capacity. */
  #evictOverflow(): void {
    if (this.#entries.size <= this.#maxEntries) return

    // Drop stale entries first so that a live entry is not evicted while an
    // expired one occupies capacity.
    const now = this.#now()
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(key)
    }

    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next()
      if (oldest.done === true) return
      this.#entries.delete(oldest.value)
    }
  }
}
