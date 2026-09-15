interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class TtlCache<T> {
  readonly #entries = new Map<string, CacheEntry<T>>()

  constructor(private readonly maxEntries = 50, private readonly now: () => number = Date.now) {}

  get(key: string): T | undefined {
    const entry = this.#entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= this.now()) {
      this.#entries.delete(key)
      return undefined
    }
    this.#entries.delete(key)
    this.#entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return
    this.#entries.delete(key)
    this.#entries.set(key, { value, expiresAt: this.now() + ttlMs })
    while (this.#entries.size > this.maxEntries) {
      const oldest = this.#entries.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.#entries.delete(oldest)
    }
  }

  clear(): void {
    this.#entries.clear()
  }
}
