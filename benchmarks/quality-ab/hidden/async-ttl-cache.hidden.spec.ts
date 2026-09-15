import { describe, expect, it, vi } from 'vitest'
import { AsyncTtlCache } from '../src/async-ttl-cache.js'

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('AsyncTtlCache hidden acceptance', () => {
  it('rejects invalid options', () => {
    expect(() => new AsyncTtlCache({ ttlMs: 0, maxEntries: 1 })).toThrow()
    expect(() => new AsyncTtlCache({ ttlMs: 1, maxEntries: 0 })).toThrow()
  })

  it('caches a fulfilled value within its TTL', async () => {
    const loader = vi.fn(async () => 42)
    const cache = new AsyncTtlCache<string, number>({ ttlMs: 100, maxEntries: 2, now: () => 10 })
    await expect(cache.get('a', loader)).resolves.toBe(42)
    await expect(cache.get('a', loader)).resolves.toBe(42)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.size).toBe(1)
  })

  it('reloads an expired value', async () => {
    let now = 0
    const loader = vi.fn(async () => loader.mock.calls.length)
    const cache = new AsyncTtlCache<string, number>({ ttlMs: 10, maxEntries: 2, now: () => now })
    await expect(cache.get('a', loader)).resolves.toBe(1)
    now = 11
    await expect(cache.get('a', loader)).resolves.toBe(2)
  })

  it('deduplicates concurrent loads for the same key', async () => {
    const pending = deferred<number>()
    const loader = vi.fn(() => pending.promise)
    const cache = new AsyncTtlCache<string, number>({ ttlMs: 100, maxEntries: 2 })
    const first = cache.get('a', loader)
    const second = cache.get('a', loader)
    expect(loader).toHaveBeenCalledTimes(1)
    pending.resolve(7)
    await expect(Promise.all([first, second])).resolves.toEqual([7, 7])
  })

  it('does not cache loader failures', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(9)
    const cache = new AsyncTtlCache<string, number>({ ttlMs: 100, maxEntries: 2 })
    await expect(cache.get('a', loader)).rejects.toThrow('boom')
    await expect(cache.get('a', loader)).resolves.toBe(9)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('evicts the least recently used entry', async () => {
    const cache = new AsyncTtlCache<string, string>({ ttlMs: 100, maxEntries: 2, now: () => 0 })
    await cache.get('a', async () => 'A')
    await cache.get('b', async () => 'B')
    await cache.get('c', async () => 'C')
    const reload = vi.fn(async () => 'A2')
    await expect(cache.get('a', reload)).resolves.toBe('A2')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('refreshes LRU order on a cache hit', async () => {
    const cache = new AsyncTtlCache<string, string>({ ttlMs: 100, maxEntries: 2, now: () => 0 })
    await cache.get('a', async () => 'A')
    await cache.get('b', async () => 'B')
    await cache.get('a', async () => 'wrong')
    await cache.get('c', async () => 'C')
    const bLoader = vi.fn(async () => 'B2')
    await expect(cache.get('b', bLoader)).resolves.toBe('B2')
    expect(bLoader).toHaveBeenCalledOnce()
  })

  it('supports delete and clear', async () => {
    const cache = new AsyncTtlCache<string, number>({ ttlMs: 100, maxEntries: 3 })
    await cache.get('a', async () => 1)
    await cache.get('b', async () => 2)
    expect(cache.delete('a')).toBe(true)
    expect(cache.delete('missing')).toBe(false)
    expect(cache.size).toBe(1)
    cache.clear()
    expect(cache.size).toBe(0)
  })

  it('does not repopulate after delete during an in-flight load', async () => {
    const pending = deferred<number>()
    const loader = vi.fn(() => pending.promise)
    const cache = new AsyncTtlCache<string, number>({ ttlMs: 100, maxEntries: 2 })
    const first = cache.get('a', loader)
    cache.delete('a')
    pending.resolve(1)
    await expect(first).resolves.toBe(1)
    const secondLoader = vi.fn(async () => 2)
    await expect(cache.get('a', secondLoader)).resolves.toBe(2)
    expect(secondLoader).toHaveBeenCalledOnce()
  })

  it('does not repopulate any key after clear during in-flight loads', async () => {
    const firstPending = deferred<number>()
    const secondPending = deferred<number>()
    const cache = new AsyncTtlCache<string, number>({ ttlMs: 100, maxEntries: 2 })
    const first = cache.get('a', () => firstPending.promise)
    const second = cache.get('b', () => secondPending.promise)
    cache.clear()
    firstPending.resolve(1)
    secondPending.resolve(2)
    await Promise.all([first, second])
    expect(cache.size).toBe(0)
  })
})
