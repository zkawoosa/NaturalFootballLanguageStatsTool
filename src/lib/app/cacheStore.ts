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
    if (!this.enabled || this.ttlMs === 0) {
      return loader();
    }

    this.evictExpired();
    const current = this.entries.get(key);
    const currentTime = this.now();

    if (current && current.expiresAt > currentTime) {
      this.hits += 1;
      this.lastHitAt = new Date(currentTime).toISOString();
      return current.value as T;
    }

    this.misses += 1;
    this.lastMissAt = new Date(currentTime).toISOString();

    const existingRequest = this.inFlight.get(key);
    if (existingRequest) {
      return (await existingRequest) as T;
    }

    const request = loader()
      .then((value) => {
        this.entries.set(key, {
          value,
          expiresAt: this.now() + this.ttlMs,
        });
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
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

  private evictExpired() {
    const currentTime = this.now();
    for (const [key, value] of this.entries.entries()) {
      if (value.expiresAt <= currentTime) {
        this.entries.delete(key);
      }
    }
  }
}
