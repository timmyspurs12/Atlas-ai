import { describe, expect, it, vi } from 'vitest';
import {
  GeoCacheService,
  type LoadFailureKind,
  type LoadResult,
  type ResolveOptions,
} from './geo-cache.service';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Loaders are plain promise factories: `async` without `await` is a lint error here. */
const ok = <T>(value: T): Promise<LoadResult<T>> => Promise.resolve({ ok: true, value });
const fail = <T>(reason: string, kind: LoadFailureKind = 'upstream'): Promise<LoadResult<T>> =>
  Promise.resolve({ ok: false, reason, kind });

function options<T>(
  overrides: Partial<ResolveOptions<T>> & { loader: () => Promise<LoadResult<T>> },
): ResolveOptions<T> {
  return {
    key: 'test-key',
    providerId: 'test',
    ttlMs: 60_000,
    staleTtlMs: 300_000,
    backoffMs: 60_000,
    dailyBudget: 1_000,
    ...overrides,
  };
}

describe('GeoCacheService coalescing', () => {
  it('turns a burst of identical requests into ONE upstream call', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn(async (): Promise<LoadResult<string>> => {
      await sleep(25);
      return { ok: true, value: 'upstream-value' };
    });

    const results = await Promise.all(
      Array.from({ length: 25 }, () => cache.resolve(options({ loader }))),
    );

    // This is the single most important cost behaviour in the module.
    expect(loader).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(25);
    for (const result of results) {
      expect(result.status).toBe('fresh');
      if (result.status === 'fresh') expect(result.value).toBe('upstream-value');
    }
  });

  it('serves the second caller from cache without touching upstream again', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<number>> => ok(42));

    const first = await cache.resolve(options({ loader }));
    const second = await cache.resolve(options({ loader }));

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ status: 'fresh', source: 'upstream' });
    expect(second).toMatchObject({ status: 'fresh', source: 'cache' });
    // Age is wall-clock, so assert a bound rather than an exact millisecond.
    if (second.status === 'fresh') expect(second.ageMs).toBeLessThan(1_000);
  });

  it('keeps distinct keys separate', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<string>> => ok('x'));
    await cache.resolve(options({ key: 'a', loader }));
    await cache.resolve(options({ key: 'b', loader }));
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('GeoCacheService serve-stale and backoff', () => {
  it('serves an expired value when upstream later fails', async () => {
    const cache = new GeoCacheService();
    let attempt = 0;
    const loader = vi.fn((): Promise<LoadResult<string>> => {
      attempt += 1;
      return attempt === 1 ? ok('good') : fail<string>('upstream down');
    });

    // A ttl of 0 means every read is already expired and must go upstream.
    await cache.resolve(options({ key: 'k', ttlMs: 0, staleTtlMs: 60_000, loader }));
    const second = await cache.resolve(options({ key: 'k', ttlMs: 0, staleTtlMs: 60_000, loader }));

    expect(second.status).toBe('stale');
    if (second.status === 'stale') expect(second.value).toBe('good');
  });

  it('does not retry a failing key inside the backoff window', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<string>> => fail<string>('boom'));

    const first = await cache.resolve(options({ key: 'k', backoffMs: 5_000, loader }));
    const second = await cache.resolve(options({ key: 'k', backoffMs: 5_000, loader }));
    const third = await cache.resolve(options({ key: 'k', backoffMs: 5_000, loader }));

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first.status).toBe('unavailable');
    expect(second.status).toBe('unavailable');
    expect(third.status).toBe('unavailable');
    if (third.status === 'unavailable') expect(third.reason).toContain('backoff');
  });

  it('retries once the backoff window has elapsed', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<string>> => fail<string>('boom'));

    await cache.resolve(options({ key: 'k', backoffMs: 10, loader }));
    await sleep(25);
    await cache.resolve(options({ key: 'k', backoffMs: 10, loader }));

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable when there is nothing stale to serve', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<string>> => fail<string>('provider said no'));

    const result = await cache.resolve(options({ key: 'cold', staleTtlMs: 0, loader }));
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'provider said no',
      kind: 'upstream',
    });
  });

  it('propagates a not_found failure kind through the cache layer', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<string>> =>
      fail<string>('No matching place was found', 'not_found'),
    );

    const result = await cache.resolve(options({ key: 'missing', loader }));
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.kind).toBe('not_found');
  });
});

describe('GeoCacheService daily budget governor', () => {
  it('stops calling upstream once the daily budget is spent', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<string>> => ok('v'));

    const first = await cache.resolve(options({ key: 'a', dailyBudget: 1, loader }));
    const second = await cache.resolve(options({ key: 'b', dailyBudget: 1, loader }));

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first.status).toBe('fresh');
    expect(second.status).toBe('unavailable');
    if (second.status === 'unavailable') expect(second.reason).toContain('budget');
  });

  it('prefers a stale value over reporting budget exhaustion', async () => {
    const cache = new GeoCacheService();
    let attempt = 0;
    const loader = vi.fn((): Promise<LoadResult<string>> => {
      attempt += 1;
      return attempt === 1 ? ok('cached-earlier') : fail<string>('down');
    });

    await cache.resolve(options({ key: 'a', dailyBudget: 1, ttlMs: 0, loader }));
    const second = await cache.resolve(
      options({ key: 'a', dailyBudget: 1, ttlMs: 0, staleTtlMs: 60_000, loader }),
    );

    expect(second.status).toBe('stale');
  });

  it('accounts budget per provider, not globally', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<string>> => ok('v'));

    await cache.resolve(options({ key: 'a', providerId: 'osrm', dailyBudget: 1, loader }));
    await cache.resolve(options({ key: 'b', providerId: 'open-meteo', dailyBudget: 1, loader }));

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('exposes budget usage without leaking cached values', () => {
    const cache = new GeoCacheService();
    expect(cache.stats()).toEqual({ entries: 0, inflight: 0, backoff: 0, budgets: {} });
  });
});

describe('GeoCacheService critical resolves (the SOS path)', () => {
  it('bypasses an exhausted daily budget', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<string>> => ok('v'));

    // Spend the entire budget on ordinary traffic.
    await cache.resolve(options({ key: 'a', dailyBudget: 1, loader }));
    const blocked = await cache.resolve(options({ key: 'b', dailyBudget: 1, loader }));
    expect(blocked.status).toBe('unavailable');

    // An emergency lookup must still go through.
    const critical = await cache.resolve(
      options({ key: 'c', dailyBudget: 1, critical: true, loader }),
    );
    expect(critical.status).toBe('fresh');
  });

  it('bypasses the failure backoff window', async () => {
    const cache = new GeoCacheService();
    let attempt = 0;
    const loader = vi.fn((): Promise<LoadResult<string>> => {
      attempt += 1;
      return attempt === 1 ? fail<string>('down') : ok('recovered');
    });

    const first = await cache.resolve(options({ key: 'k', backoffMs: 60_000, loader }));
    expect(first.status).toBe('unavailable');

    // Ordinary traffic is backed off...
    const normal = await cache.resolve(options({ key: 'k', backoffMs: 60_000, loader }));
    expect(normal.status).toBe('unavailable');

    // ...but an emergency is not.
    const critical = await cache.resolve(
      options({ key: 'k', backoffMs: 60_000, critical: true, loader }),
    );
    expect(critical.status).toBe('fresh');
    if (critical.status === 'fresh') expect(critical.value).toBe('recovered');
  });

  it('does not poison a key for ordinary traffic when a critical lookup fails', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<string>> => fail<string>('down'));

    await cache.resolve(options({ key: 'k', backoffMs: 60_000, critical: true, loader }));
    // No backoff was recorded, so the next ordinary call still tries upstream.
    await cache.resolve(options({ key: 'k', backoffMs: 60_000, loader }));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('still coalesces and still caches, so the bypass cannot become a request storm', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn(async (): Promise<LoadResult<string>> => {
      await sleep(20);
      return { ok: true, value: 'v' };
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        cache.resolve(options({ key: 'k', critical: true, dailyBudget: 0, loader })),
      ),
    );
    expect(loader).toHaveBeenCalledTimes(1);

    const cached = await cache.resolve(
      options({ key: 'k', critical: true, dailyBudget: 0, loader }),
    );
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cached).toMatchObject({ status: 'fresh', source: 'cache' });
    expect(results.every((result) => result.status === 'fresh')).toBe(true);
  });
});

describe('GeoCacheService memory bound', () => {
  it('evicts the oldest entries once the cap is exceeded', async () => {
    const cache = new GeoCacheService();
    const loader = vi.fn((): Promise<LoadResult<number>> => ok(1));

    // The cap is 5,000; one extra insert must evict the very first key.
    const cap = 5_000;
    for (let index = 0; index <= cap; index += 1) {
      await cache.resolve(options({ key: `k${index}`, dailyBudget: 100_000, loader }));
    }

    expect(cache.stats().entries).toBe(cap);

    // The first key is gone, so asking for it must go upstream again.
    const callsBefore = loader.mock.calls.length;
    await cache.resolve(options({ key: 'k0', dailyBudget: 100_000, loader }));
    expect(loader.mock.calls.length).toBe(callsBefore + 1);
  });
});
