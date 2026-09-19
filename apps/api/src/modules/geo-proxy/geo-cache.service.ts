import { Injectable, Logger } from '@nestjs/common';
import { evaluateDailyBudget, utcDayStamp } from './domain/upstream.policy';

/**
 * Why a load failed. Kept structured rather than inferred from the message so controllers
 * can answer 404 (nothing matched) differently from 503 (provider unavailable).
 */
export type LoadFailureKind = 'invalid' | 'upstream' | 'not_found';

export type LoadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string; readonly kind: LoadFailureKind };

export type CacheOutcome<T> =
  | {
      readonly status: 'fresh';
      readonly source: 'cache' | 'upstream';
      readonly value: T;
      readonly ageMs: number;
    }
  | { readonly status: 'stale'; readonly value: T; readonly ageMs: number }
  | {
      readonly status: 'unavailable';
      readonly reason: string;
      readonly kind: LoadFailureKind;
    };

export interface ResolveOptions<T> {
  /** Cache key. Build it with `cacheCellKey` so nearby requests share one upstream call. */
  readonly key: string;
  /** Identifier used for daily budget accounting. */
  readonly providerId: string;
  readonly ttlMs: number;
  /** How long an expired entry may still be served when upstream is failing. */
  readonly staleTtlMs: number;
  /** After a failure, do not retry this key until this many ms have passed. */
  readonly backoffMs: number;
  /** Maximum upstream calls for this provider per UTC day. */
  readonly dailyBudget: number;
  /**
   * A critical resolve bypasses the daily budget and the failure backoff window.
   *
   * This exists for the SOS path. A cost governor protects against *runaway spend*; it must
   * never become the reason an emergency lookup is refused or delayed. Critical resolves
   * still use the cache and still coalesce, so the bypass cannot be turned into a request
   * storm — repeated identical lookups remain a single upstream call.
   */
  readonly critical?: boolean;
  readonly loader: () => Promise<LoadResult<T>>;
}

interface CacheEntry {
  readonly value: unknown;
  readonly storedAt: number;
}

interface BudgetRecord {
  day: string;
  used: number;
}

const DEFAULT_MAX_ENTRIES = 5_000;

/**
 * In-memory cache for upstream geo responses.
 *
 * Four behaviours matter on a free tier, and all four are deliberate:
 *
 *  1. **Coalescing.** A burst of identical or near-identical requests (a map pan, a fleet of
 *     clients loading the same city) produces exactly one upstream call. Everyone else
 *     awaits the same promise.
 *  2. **Serve-stale.** When a provider is down or rate-limiting, an expired-but-recent value
 *     is far more useful to a user than an error. Stale results are always labelled as such
 *     by the caller so nothing silently pretends to be live.
 *  3. **Backoff.** A failing key is not retried on every request. Without this, one broken
 *     provider turns into a self-inflicted request storm.
 *  4. **Daily budget.** A hard per-provider ceiling so a free quota degrades gracefully
 *     instead of being exhausted — after which Atlas serves cache rather than burning the
 *     next day's allowance.
 *
 * Deliberately in-memory rather than Redis: Phase 0 runs a single API instance (see
 * `REDIS_OPTIONAL` in docs/free-tier-hosting.md), so a shared cache would add a paid or
 * capped dependency for no benefit. If Atlas ever runs multiple instances, move this behind
 * the existing `RedisService` — the `ResolveOptions` surface does not change.
 */
@Injectable()
export class GeoCacheService {
  private readonly logger = new Logger(GeoCacheService.name);
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<LoadResult<unknown>>>();
  private readonly backoffUntil = new Map<string, number>();
  private readonly budgets = new Map<string, BudgetRecord>();
  private readonly maxEntries: number;

  constructor() {
    this.maxEntries = DEFAULT_MAX_ENTRIES;
  }

  async resolve<T>(options: ResolveOptions<T>): Promise<CacheOutcome<T>> {
    const { key, ttlMs, staleTtlMs } = options;
    const now = Date.now();
    const entry = this.entries.get(key);

    if (entry && now - entry.storedAt < ttlMs) {
      return {
        status: 'fresh',
        source: 'cache',
        value: entry.value as T,
        ageMs: now - entry.storedAt,
      };
    }

    // Join an in-flight call rather than starting a second one.
    const pending = this.inflight.get(key);
    if (pending) {
      const shared = await pending;
      if (shared.ok) {
        return { status: 'fresh', source: 'upstream', value: shared.value as T, ageMs: 0 };
      }
      return this.degrade<T>(entry, staleTtlMs, { reason: shared.reason, kind: shared.kind }, now);
    }

    const critical = options.critical === true;

    // Inside the backoff window: serve what we have, do not hammer a failing provider.
    // Critical resolves ignore the window — an emergency is not optional traffic.
    const backoffUntil = this.backoffUntil.get(key) ?? 0;
    if (!critical && now < backoffUntil) {
      return this.degrade<T>(
        entry,
        staleTtlMs,
        { reason: 'Upstream is in a failure backoff window', kind: 'upstream' },
        now,
      );
    }

    if (!critical) {
      const budget = this.consumeBudget(options.providerId, options.dailyBudget);
      if (!budget.ok) {
        return this.degrade<T>(entry, staleTtlMs, { reason: budget.reason, kind: 'upstream' }, now);
      }
    }

    const promise = options.loader() as Promise<LoadResult<unknown>>;
    this.inflight.set(key, promise);
    try {
      const result = await promise;
      if (result.ok) {
        this.store(key, result.value);
        this.backoffUntil.delete(key);
        return { status: 'fresh', source: 'upstream', value: result.value as T, ageMs: 0 };
      }
      // A failed critical lookup must not poison the key for ordinary traffic.
      if (!critical) this.backoffUntil.set(key, Date.now() + options.backoffMs);
      return this.degrade<T>(
        entry,
        staleTtlMs,
        { reason: result.reason, kind: result.kind },
        Date.now(),
      );
    } finally {
      this.inflight.delete(key);
    }
  }

  /** Prefer a stale value; only report unavailable when there is genuinely nothing to serve. */
  private degrade<T>(
    entry: CacheEntry | undefined,
    staleTtlMs: number,
    failure: { readonly reason: string; readonly kind: LoadFailureKind },
    now: number,
  ): CacheOutcome<T> {
    if (entry && now - entry.storedAt < staleTtlMs) {
      return { status: 'stale', value: entry.value as T, ageMs: now - entry.storedAt };
    }
    return { status: 'unavailable', reason: failure.reason, kind: failure.kind };
  }

  private store(key: string, value: unknown): void {
    this.entries.set(key, { value, storedAt: Date.now() });
    // Bounded memory: a 512 MB free instance must not leak cache indefinitely.
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  /**
   * Account for one upstream call against a provider's daily ceiling.
   * The budget resets on the UTC day, matching how public providers meter.
   */
  private consumeBudget(
    providerId: string,
    limit: number,
  ): { ok: true } | { ok: false; reason: string } {
    const today = utcDayStamp();
    const record = this.budgets.get(providerId);
    const state = record && record.day === today ? record : undefined;

    const verdict = evaluateDailyBudget(state ? { used: state.used, limit } : undefined, limit);
    if (!verdict.ok) {
      this.logger.warn(`Geo proxy budget exhausted for ${providerId}: ${verdict.reason}`);
      return { ok: false, reason: verdict.reason };
    }

    if (state) {
      state.used += 1;
    } else {
      this.budgets.set(providerId, { day: today, used: 1 });
    }
    return { ok: true };
  }

  /** Observability snapshot for the health/debug surface. Contains no user data. */
  stats(): Record<string, unknown> {
    return {
      entries: this.entries.size,
      inflight: this.inflight.size,
      backoff: this.backoffUntil.size,
      budgets: Object.fromEntries(
        [...this.budgets.entries()].map(([provider, record]) => [provider, record.used]),
      ),
    };
  }
}
