export type CacheStats = {
  enabled: boolean;
  ttlSeconds: number;
  entries: number;
  hits: number;
  misses: number;
  lastHitAt: string | null;
  lastMissAt: string | null;
};

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

type CacheStoreOptions = {
  enabled: boolean;
  ttlSeconds: number;
  now?: () => number;
};

type CachedLoadResult<T> = {
  value: T;
  stale: boolean;
};

export class InMemoryRequestCache {
  private readonly enabled: boolean;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;
  private lastHitAt: string | null = null;
  private lastMissAt: string | null = null;

  constructor(options: CacheStoreOptions) {
    this.enabled = options.enabled;
    this.ttlMs = Math.max(0, Math.floor(options.ttlSeconds * 1000));
    this.now = options.now ?? (() => Date.now());
  }

  async getOrSet<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const { value } = await this.getOrSetWithStaleFallback(key, loader, {
      allowStale: false,
    });
    return value;
  }

  async getOrSetWithStaleFallback<T>(
    key: string,
    loader: () => Promise<T>,
    options?: { allowStale?: boolean }
  ): Promise<CachedLoadResult<T>> {
    const allowStale = options?.allowStale ?? true;

    if (!this.enabled || this.ttlMs === 0) {
      const value = await loader();
      return { value, stale: false };
    }

    const currentTime = this.now();
    const current = this.entries.get(key);

    if (current && current.expiresAt > currentTime) {
      this.hits += 1;
      this.lastHitAt = new Date(currentTime).toISOString();
      return { value: current.value as T, stale: false };
    }

    if (current && current.expiresAt <= currentTime && !allowStale) {
      this.entries.delete(key);
    }

    this.misses += 1;
    this.lastMissAt = new Date(currentTime).toISOString();

    const staleValue = allowStale && current ? (current.value as T) : undefined;
    const existingRequest = this.inFlight.get(key) as Promise<CachedLoadResult<T>> | undefined;
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async () => {
      const value = await loader();
      this.entries.set(key, {
        value,
        expiresAt: this.now() + this.ttlMs,
      });
      return { value, stale: false };
    })().catch((error) => {
      if (allowStale && staleValue !== undefined) {
        return { value: staleValue, stale: true };
      }
      throw error;
    });

    this.inFlight.set(key, request);
    return request.finally(() => {
      this.inFlight.delete(key);
    });
  }

  getStats(): CacheStats {
    this.evictExpired();

    return {
      enabled: this.enabled && this.ttlMs > 0,
      ttlSeconds: Math.floor(this.ttlMs / 1000),
      entries: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      lastHitAt: this.lastHitAt,
      lastMissAt: this.lastMissAt,
    };
  }

  clearExpiredEntries(): void {
    const currentTime = this.now();
    for (const [key, value] of this.entries.entries()) {
      if (value.expiresAt <= currentTime) {
        this.entries.delete(key);
      }
    }
  }

  private evictExpired() {
    this.clearExpiredEntries();
  }
}
