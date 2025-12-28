import { describe, it, expect } from 'vitest';
import { LRUCache } from './cache';

describe('LRUCache', () => {
  describe('constructor', () => {
    it('creates a cache with default maxSize of 100', () => {
      const cache = new LRUCache<string, number>();
      // Fill beyond default size to verify eviction
      for (let i = 0; i < 101; i++) {
        cache.set(`key${i}`, i);
      }
      expect(cache.size).toBe(100);
    });

    it('creates a cache with custom maxSize', () => {
      const cache = new LRUCache<string, number>(5);
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, i);
      }
      expect(cache.size).toBe(5);
    });
  });

  describe('set', () => {
    it('adds items to the cache', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      expect(cache.size).toBe(3);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('updates existing key without evicting', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('a', 10); // Update existing
      expect(cache.size).toBe(3);
      expect(cache.get('a')).toBe(10);
    });

    it('evicts least recently used item when capacity is exceeded', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // Should evict 'a'
      expect(cache.size).toBe(3);
      expect(cache.has('a')).toBe(false);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('moves updated key to most recently used position', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('a', 10); // Update 'a', making it most recent
      cache.set('d', 4); // Should evict 'b' (now the LRU)
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });
  });

  describe('get', () => {
    it('returns undefined for non-existent key', () => {
      const cache = new LRUCache<string, number>(3);
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('returns the value for existing key', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 42);
      expect(cache.get('a')).toBe(42);
    });

    it('moves accessed key to most recently used position', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // Access 'a', making it most recent
      cache.set('d', 4); // Should evict 'b' (now the LRU)
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('handles undefined values correctly', () => {
      const cache = new LRUCache<string, undefined>(3);
      cache.set('a', undefined);
      expect(cache.has('a')).toBe(true);
      expect(cache.get('a')).toBeUndefined();
      // Ensure it's still in the cache after get
      expect(cache.has('a')).toBe(true);
    });

    it('handles null values correctly', () => {
      const cache = new LRUCache<string, null>(3);
      cache.set('a', null);
      expect(cache.has('a')).toBe(true);
      expect(cache.get('a')).toBeNull();
    });

    it('handles falsy values correctly', () => {
      const cache = new LRUCache<string, number | string | boolean>(5);
      cache.set('zero', 0);
      cache.set('empty', '');
      cache.set('false', false);

      expect(cache.get('zero')).toBe(0);
      expect(cache.get('empty')).toBe('');
      expect(cache.get('false')).toBe(false);
    });
  });

  describe('delete', () => {
    it('removes existing key and returns true', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      expect(cache.delete('a')).toBe(true);
      expect(cache.has('a')).toBe(false);
      expect(cache.size).toBe(0);
    });

    it('returns false for non-existent key', () => {
      const cache = new LRUCache<string, number>(3);
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all items from the cache', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(false);
    });
  });

  describe('size', () => {
    it('returns 0 for empty cache', () => {
      const cache = new LRUCache<string, number>(3);
      expect(cache.size).toBe(0);
    });

    it('returns correct count after adding items', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      expect(cache.size).toBe(1);
      cache.set('b', 2);
      expect(cache.size).toBe(2);
    });

    it('does not exceed maxSize', () => {
      const cache = new LRUCache<string, number>(3);
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, i);
        expect(cache.size).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('has', () => {
    it('returns false for non-existent key', () => {
      const cache = new LRUCache<string, number>(3);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('returns true for existing key', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
    });

    it('returns true for key with undefined value', () => {
      const cache = new LRUCache<string, undefined>(3);
      cache.set('a', undefined);
      expect(cache.has('a')).toBe(true);
    });

    it('does not update LRU order (intentional behavior)', () => {
      // Note: has() intentionally does NOT update LRU order
      // This is a design choice - only get() and set() affect ordering
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.has('a'); // Check but don't update LRU order
      cache.set('d', 4); // Should evict 'a' since has() didn't update order
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
    });
  });

  describe('LRU eviction order', () => {
    it('evicts items in correct LRU order', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // 'a' is LRU, then 'b', then 'c'
      cache.set('d', 4); // Evicts 'a'
      expect(cache.has('a')).toBe(false);

      cache.set('e', 5); // Evicts 'b'
      expect(cache.has('b')).toBe(false);

      cache.set('f', 6); // Evicts 'c'
      expect(cache.has('c')).toBe(false);

      // Only d, e, f remain
      expect(cache.has('d')).toBe(true);
      expect(cache.has('e')).toBe(true);
      expect(cache.has('f')).toBe(true);
    });

    it('correctly updates LRU order on access pattern', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access pattern: a, b, c, b, a
      cache.get('a');
      cache.get('b');
      cache.get('c');
      cache.get('b');
      cache.get('a');

      // Now order is: c (LRU), b, a (MRU)
      cache.set('d', 4); // Should evict 'c'
      expect(cache.has('c')).toBe(false);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });
  });

  describe('type safety', () => {
    it('works with number keys', () => {
      const cache = new LRUCache<number, string>(3);
      cache.set(1, 'one');
      cache.set(2, 'two');
      expect(cache.get(1)).toBe('one');
      expect(cache.get(2)).toBe('two');
    });

    it('works with object values', () => {
      interface Person {
        name: string;
        age: number;
      }
      const cache = new LRUCache<string, Person>(3);
      const person = { name: 'Alice', age: 30 };
      cache.set('alice', person);
      expect(cache.get('alice')).toEqual(person);
    });

    it('works with complex key types', () => {
      // Using objects as keys (reference equality)
      const cache = new LRUCache<object, number>(3);
      const key1 = { id: 1 };
      const key2 = { id: 2 };
      cache.set(key1, 100);
      cache.set(key2, 200);
      expect(cache.get(key1)).toBe(100);
      expect(cache.get(key2)).toBe(200);
      // Different object with same structure is a different key
      expect(cache.get({ id: 1 })).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles maxSize of 1', () => {
      const cache = new LRUCache<string, number>(1);
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
      cache.set('b', 2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.size).toBe(1);
    });

    it('handles rapid set/get cycles', () => {
      const cache = new LRUCache<string, number>(100);
      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i % 50}`, i);
        cache.get(`key${(i + 25) % 50}`);
      }
      expect(cache.size).toBeLessThanOrEqual(100);
    });

    it('maintains consistency after mixed operations', () => {
      const cache = new LRUCache<string, number>(5);

      // Add items
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Delete one
      cache.delete('b');
      expect(cache.size).toBe(2);

      // Add more
      cache.set('d', 4);
      cache.set('e', 5);
      cache.set('f', 6);
      cache.set('g', 7); // Should evict 'a' (oldest remaining)

      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
      expect(cache.has('e')).toBe(true);
      expect(cache.has('f')).toBe(true);
      expect(cache.has('g')).toBe(true);
      expect(cache.size).toBe(5);
    });
  });
});
