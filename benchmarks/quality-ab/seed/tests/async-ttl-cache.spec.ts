import { describe, expect, it, vi } from 'vitest'
import { AsyncTtlCache } from '../src/async-ttl-cache.js'

describe('AsyncTtlCache', () => {
  it('caches successful values and expires them', async () => {
    let now = 0
    const loader = vi.fn(async () => loader.mock.calls.length)
    const cache = new AsyncTtlCache<string, number>({ ttlMs: 10, maxEntries: 2, now: () => now })

    await expect(cache.get('a', loader)).resolves.toBe(1)
    await expect(cache.get('a', loader)).resolves.toBe(1)
    now = 11
    await expect(cache.get('a', loader)).resolves.toBe(2)
  })

  it('deduplicates concurrent loads', async () => {
    let resolve!: (value: number) => void
    const pending = new Promise<number>(done => { resolve = done })
    const loader = vi.fn(() => pending)
    const cache = new AsyncTtlCache<string, number>({ ttlMs: 100, maxEntries: 2 })

    const first = cache.get('a', loader)
    const second = cache.get('a', loader)
    resolve(7)

    await expect(Promise.all([first, second])).resolves.toEqual([7, 7])
    expect(loader).toHaveBeenCalledOnce()
  })

  it('evicts the least recently used value', async () => {
    const cache = new AsyncTtlCache<string, string>({ ttlMs: 100, maxEntries: 2, now: () => 0 })
    await cache.get('a', async () => 'A')
    await cache.get('b', async () => 'B')
    await cache.get('a', async () => 'wrong')
    await cache.get('c', async () => 'C')

    const reload = vi.fn(async () => 'B2')
    await expect(cache.get('b', reload)).resolves.toBe('B2')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not repopulate a deleted in-flight key', async () => {
    let resolve!: (value: number) => void
    const pending = new Promise<number>(done => { resolve = done })
    const cache = new AsyncTtlCache<string, number>({ ttlMs: 100, maxEntries: 2 })
    const first = cache.get('a', () => pending)

    cache.delete('a')
    resolve(1)
    await expect(first).resolves.toBe(1)

    const reload = vi.fn(async () => 2)
    await expect(cache.get('a', reload)).resolves.toBe(2)
    expect(reload).toHaveBeenCalledOnce()
  })
})
