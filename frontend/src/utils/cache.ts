/**
 * Generic LRU (Least Recently Used) cache implementation.
 *
 * Uses Map's iteration order (insertion order) to track recency.
 * When capacity is exceeded, the least recently accessed item is evicted.
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    const value = this.cache.get(key);
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, value as V);
    return value;
  }

  set(key: K, value: V): void {
    // If key exists, delete it first (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item in Map)
      const firstEntry = this.cache.keys().next();
      if (!firstEntry.done) {
        this.cache.delete(firstEntry.value);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }
}
