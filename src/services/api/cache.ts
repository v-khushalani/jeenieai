import safeLocalStorage from '@/utils/safeStorage';
/**
 * Multi-Level Cache Service
 * 
 * Provides:
 * - L1: In-memory cache (fastest, limited size)
 * - L2: LocalStorage cache (persistent, larger)
 * - Automatic TTL expiration
 * - LRU eviction
 * - Cache invalidation patterns
 * 
 * FREE solution - no Redis required
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  tags?: string[];
}

interface CacheConfig {
  maxMemoryItems: number;
  maxStorageItems: number;
  defaultTTL: number;
  storagePrefix: string;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxMemoryItems: 500,
  maxStorageItems: 1000,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  storagePrefix: 'jeenie_cache_',
};

class CacheService {
  private memoryCache = new Map<string, CacheEntry<unknown>>();
  private accessOrder: string[] = [];
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
  }

  /**
   * Get item from cache (checks memory first, then storage)
   */
  get<T>(key: string): T | null {
    // L1: Check memory cache
    const memoryEntry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memoryEntry) {
      if (this.isValid(memoryEntry)) {
        this.updateAccessOrder(key);
        return memoryEntry.data;
      }
      this.memoryCache.delete(key);
    }

    // L2: Check localStorage
    const storageEntry = this.getFromStorage<T>(key);
    if (storageEntry && this.isValid(storageEntry)) {
      // Promote to memory cache
      this.setMemory(key, storageEntry.data, storageEntry.ttl, storageEntry.tags);
      return storageEntry.data;
    }

    return null;
  }

  /**
   * Set item in cache (both memory and storage)
   */
  set<T>(
    key: string, 
    data: T, 
    ttl: number = this.config.defaultTTL,
    tags?: string[]
  ): void {
    this.setMemory(key, data, ttl, tags);
    this.setStorage(key, data, ttl, tags);
  }

  /**
   * Set item only in memory cache (for frequently accessed, temporary data)
   */
  setMemory<T>(
    key: string, 
    data: T, 
    ttl: number = this.config.defaultTTL,
    tags?: string[]
  ): void {
    // LRU eviction
    if (this.memoryCache.size >= this.config.maxMemoryItems) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }

    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      tags,
    });
    this.updateAccessOrder(key);
  }

  /**
   * Delete item from cache
   */
  delete(key: string): void {
    this.memoryCache.delete(key);
    this.removeFromStorage(key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
  }

  /**
   * Invalidate all items with a specific tag
   */
  invalidateByTag(tag: string): void {
    const keysToDelete: string[] = [];
    
    this.memoryCache.forEach((entry, key) => {
      if (entry.tags?.includes(tag)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.delete(key));
  }

  /**
   * Invalidate items matching a pattern
   */
  invalidateByPattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const keysToDelete: string[] = [];

    this.memoryCache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.delete(key));
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.memoryCache.clear();
    this.accessOrder = [];
    this.clearStorage();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      memoryItems: this.memoryCache.size,
      memoryMaxItems: this.config.maxMemoryItems,
      accessOrderLength: this.accessOrder.length,
    };
  }

  // Private methods

  private isValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  private updateAccessOrder(key: string): void {
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }

  private getFromStorage<T>(key: string): CacheEntry<T> | null {
    try {
      const stored = safeLocalStorage.getItem(this.config.storagePrefix + key);
      if (!stored) return null;
      return JSON.parse(stored) as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  private setStorage<T>(
    key: string, 
    data: T, 
    ttl: number,
    tags?: string[]
  ): void {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
        tags,
      };
      safeLocalStorage.setItem(
        this.config.storagePrefix + key, 
        JSON.stringify(entry)
      );
    } catch (error) {
      // Storage full - clear old items
      this.pruneStorage();
    }
  }

  private removeFromStorage(key: string): void {
    try {
      safeLocalStorage.removeItem(this.config.storagePrefix + key);
    } catch {
      // Ignore errors
    }
  }

  private clearStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.config.storagePrefix)) {
          safeLocalStorage.removeItem(key);
        }
      });
    } catch {
      // Ignore errors
    }
  }

  private pruneStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const keys = Object.keys(localStorage).filter(key => key.startsWith(this.config.storagePrefix));
      
      // Remove oldest 20% of items
      const itemsToRemove = Math.ceil(keys.length * 0.2);
      keys.slice(0, itemsToRemove).forEach(key => {
        safeLocalStorage.removeItem(key);
      });
    } catch {
      // Ignore errors
    }
  }

  private loadFromStorage(): void {
    // Pre-warm memory cache from localStorage on startup
    try {
      if (typeof localStorage === 'undefined') return;
      const keys = Object.keys(localStorage)
        .filter(key => key.startsWith(this.config.storagePrefix))
        .slice(0, 100); // Load max 100 items to memory

      keys.forEach(fullKey => {
        const key = fullKey.replace(this.config.storagePrefix, '');
        const entry = this.getFromStorage(key);
        if (entry && this.isValid(entry)) {
          this.memoryCache.set(key, entry);
          this.accessOrder.push(key);
        }
      });
    } catch {
      // Ignore errors
    }
  }
}

// Singleton instance with default config
export const cache = new CacheService();

// Cache TTL constants
export const CACHE_TTL = {
  SHORT: 60 * 1000,           // 1 minute
  MEDIUM: 5 * 60 * 1000,      // 5 minutes
  LONG: 30 * 60 * 1000,       // 30 minutes
  VERY_LONG: 60 * 60 * 1000,  // 1 hour
  DAY: 24 * 60 * 60 * 1000,   // 24 hours
} as const;

// Cache tags for invalidation
export const CACHE_TAGS = {
  QUESTIONS: 'questions',
  CHAPTERS: 'chapters',
  TOPICS: 'topics',
  BATCHES: 'batches',
  USER: 'user',
  TESTS: 'tests',
  AI: 'ai',
} as const;

export { CacheService };
