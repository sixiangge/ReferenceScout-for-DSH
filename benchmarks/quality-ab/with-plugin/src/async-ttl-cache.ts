/**
 * `AsyncTtlCache` — a small in-memory cache that hides three behaviours behind a
 * single `get` call:
 *
 * - **Time to live** — every value expires `ttlMs` after it was stored.
 * - **Bounded size** — at most `maxEntries` values are retained; the least
 *   recently used entry is evicted to make room.
 * - **In-flight coalescing** — concurrent `get` calls for the same key await a
 *   single loader invocation instead of stampeding the origin.
 *
 * Time is read through an injectable clock, which keeps expiry deterministic in
 * tests and lets callers share a single source of truth.
 */

/** Options accepted by the {@link AsyncTtlCache} constructor. */
export interface AsyncTtlCacheOptions {
  /**
   * How long a stored value stays fresh, in milliseconds. A non-positive value
   * means "never cache"; `Infinity` means "never expires".
   */
  readonly ttlMs: number
  /**
   * Maximum number of values kept. When full, the least recently used entry is
   * evicted first. A non-positive value disables caching entirely.
   */
  readonly maxEntries: number
  /** Clock source in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number
}

/**
 * Produces the value for a missing key. The loader may be synchronous or
 * asynchronous; if it rejects, the rejection reaches every waiter and nothing
 * is cached.
 */
export type AsyncTtlCacheLoader<K, V> = (key: K) => V | PromiseLike<V>

interface Entry<V> {
  readonly value: V
  readonly expiresAt: number
}

interface InFlight<V> {
  readonly promise: Promise<V>
}

export class AsyncTtlCache<K, V> {
  readonly #ttlMs: number
  readonly #maxEntries: number
  readonly #now: () => number

  /** Insertion order doubles as LRU order: the first key is the least recent. */
  readonly #entries = new Map<K, Entry<V>>()

  /** Loads currently in flight, keyed for coalescing and invalidation. */
  readonly #loading = new Map<K, InFlight<V>>()

  constructor(options: AsyncTtlCacheOptions) {
    this.#ttlMs = options.ttlMs
    this.#maxEntries = options.maxEntries
    this.#now = options.now ?? Date.now
  }

  /**
   * Returns the fresh value for `key`, or runs `loader` to produce one on a
   * miss.
   *
   * Concurrent misses for the same key share one loader call, and all waiters
   * observe the same settlement. A rejected load caches nothing, so the key is
   * retried on the next call. A value that settles after the key was deleted or
   * replaced is discarded instead of resurrected.
   */
  get(key: K, loader: AsyncTtlCacheLoader<K, V>): Promise<V> {
    const cached = this.#read(key, true)
    if (cached !== undefined) return Promise.resolve(cached.value)

    const pending = this.#loading.get(key)
    if (pending !== undefined) return pending.promise

    const load = Promise.resolve()
      .then(() => loader(key))
      .then(
        (value) => {
          this.#settle(key, load, value)
          return value
        },
        (error: unknown) => {
          this.#discard(key, load)
          throw error
        },
      )

    this.#loading.set(key, { promise: load })
    return load
  }

  /**
   * Stores `value` under `key`, discarding any load already in flight for it so
   * the explicit value cannot be clobbered. Returns the cache for chaining.
   */
  set(key: K, value: V, ttlMs: number = this.#ttlMs): this {
    this.#loading.delete(key)
    this.#write(key, value, ttlMs)
    return this
  }

  /** Reports whether a fresh value is cached for `key`, without affecting recency. */
  has(key: K): boolean {
    return this.#read(key, false) !== undefined
  }

  /**
   * Drops the cached value and invalidates any in-flight load for `key`. A load
   * that is already running still resolves for its callers, but its result is
   * not cached. Returns whether anything was removed.
   */
  delete(key: K): boolean {
    const removed = this.#entries.delete(key)
    const invalidated = this.#loading.delete(key)
    return removed || invalidated
  }

  /** Removes every cached value and invalidates every in-flight load. */
  clear(): void {
    this.#entries.clear()
    this.#loading.clear()
  }

  /** Number of fresh entries; expired entries are not counted. */
  get size(): number {
    const now = this.#now()
    let live = 0
    for (const entry of this.#entries.values()) {
      if (now < entry.expiresAt) live += 1
    }
    return live
  }

  /** Looks up a fresh entry, reaping it if expired and optionally refreshing LRU order. */
  #read(key: K, touch: boolean): Entry<V> | undefined {
    const entry = this.#entries.get(key)
    if (entry === undefined) return undefined

    if (this.#now() >= entry.expiresAt) {
      this.#entries.delete(key)
      return undefined
    }

    if (touch) {
      // Re-insert so the key moves to the most-recently-used end of the map.
      this.#entries.delete(key)
      this.#entries.set(key, entry)
    }

    return entry
  }

  /** Stores an entry, then evicts least-recently-used keys until within capacity. */
  #write(key: K, value: V, ttlMs: number): void {
    this.#entries.delete(key)
    if (!(ttlMs > 0)) return

    this.#entries.set(key, { value, expiresAt: this.#now() + ttlMs })

    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next()
      if (oldest.done) break
      this.#entries.delete(oldest.value)
    }
  }

  /** Caches a settled load only while it is still the current load for `key`. */
  #settle(key: K, load: Promise<V>, value: V): void {
    if (this.#loading.get(key)?.promise !== load) return
    this.#loading.delete(key)
    this.#write(key, value, this.#ttlMs)
  }

  /** Clears a rejected load only while it is still the current load for `key`. */
  #discard(key: K, load: Promise<V>): void {
    if (this.#loading.get(key)?.promise === load) this.#loading.delete(key)
  }
}
