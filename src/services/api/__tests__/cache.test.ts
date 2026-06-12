import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheService, CACHE_TTL, CACHE_TAGS } from '../cache';

import safeLocalStorage from '@/utils/safeStorage';
describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    safeLocalStorage.clear();
    cache = new CacheService({ maxMemoryItems: 10, maxStorageItems: 20 });
  });

  // ── Basic CRUD ──
  describe('get/set', () => {
    it('stores and retrieves a value', () => {
      cache.set('key1', { name: 'test' });
      expect(cache.get('key1')).toEqual({ name: 'test' });
    });

    it('returns null for missing key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('stores different data types', () => {
      cache.set('string', 'hello');
      cache.set('number', 42);
      cache.set('array', [1, 2, 3]);
      cache.set('object', { a: 1 });

      expect(cache.get('string')).toBe('hello');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('array')).toEqual([1, 2, 3]);
      expect(cache.get('object')).toEqual({ a: 1 });
    });
  });

  // ── TTL Expiration ──
  describe('TTL expiration', () => {
    it('expires items after TTL', () => {
      vi.useFakeTimers();
      cache.set('expire-me', 'data', 1000); // 1 second TTL
      
      expect(cache.get('expire-me')).toBe('data');
      
      vi.advanceTimersByTime(1100);
      expect(cache.get('expire-me')).toBeNull();
      
      vi.useRealTimers();
    });

    it('does not expire items within TTL', () => {
      vi.useFakeTimers();
      cache.set('keep-me', 'data', 5000);
      
      vi.advanceTimersByTime(3000);
      expect(cache.get('keep-me')).toBe('data');
      
      vi.useRealTimers();
    });
  });

  // ── LRU Eviction ──
  describe('LRU eviction', () => {
    it('evicts oldest items from memory when max capacity reached', () => {
      // Use setMemory to avoid localStorage persistence (which bypasses memory eviction)
      const smallCache = new CacheService({ maxMemoryItems: 3 });

      smallCache.setMemory('a', 1);
      smallCache.setMemory('b', 2);
      smallCache.setMemory('c', 3);
      smallCache.setMemory('d', 4); // Should evict 'a' from memory

      // After memory eviction, 'a' is no longer in memory 
      // and since we used setMemory (not set), it's not in localStorage either
      expect(smallCache.get('a')).toBeNull();
      expect(smallCache.get('d')).toBe(4);
    });
  });

  // ── Delete ──
  describe('delete', () => {
    it('removes item from cache', () => {
      cache.set('delete-me', 'data');
      expect(cache.get('delete-me')).toBe('data');
      
      cache.delete('delete-me');
      expect(cache.get('delete-me')).toBeNull();
    });

    it('does not throw when deleting nonexistent key', () => {
      expect(() => cache.delete('nonexistent')).not.toThrow();
    });
  });

  // ── Tag Invalidation ──
  describe('invalidateByTag', () => {
    it('removes all items with a specific tag', () => {
      cache.set('q1', 'question 1', 60000, ['questions']);
      cache.set('q2', 'question 2', 60000, ['questions']);
      cache.set('u1', 'user 1', 60000, ['user']);

      cache.invalidateByTag('questions');

      expect(cache.get('q1')).toBeNull();
      expect(cache.get('q2')).toBeNull();
      expect(cache.get('u1')).toBe('user 1');
    });
  });

  // ── Pattern Invalidation ──
  describe('invalidateByPattern', () => {
    it('removes items matching a regex pattern', () => {
      cache.set('user:1', 'user 1');
      cache.set('user:2', 'user 2');
      cache.set('question:1', 'q1');

      cache.invalidateByPattern(/user:.*/);

      expect(cache.get('user:1')).toBeNull();
      expect(cache.get('user:2')).toBeNull();
      expect(cache.get('question:1')).toBe('q1');
    });

    it('accepts string patterns', () => {
      cache.set('sub:1', 'sub');
      cache.set('sub:2', 'sub2');
      cache.invalidateByPattern('sub:.*');
      expect(cache.get('sub:1')).toBeNull();
    });
  });

  // ── Clear ──
  describe('clear', () => {
    it('removes all items', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.clear();

      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
      expect(cache.get('c')).toBeNull();
    });
  });

  // ── Stats ──
  describe('getStats', () => {
    it('reports correct statistics', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      const stats = cache.getStats();
      expect(stats.memoryItems).toBe(2);
      expect(stats.memoryMaxItems).toBe(10);
    });
  });

  // ── Constants ──
  describe('CACHE_TTL constants', () => {
    it('defines correct TTL values', () => {
      expect(CACHE_TTL.SHORT).toBe(60 * 1000);
      expect(CACHE_TTL.MEDIUM).toBe(5 * 60 * 1000);
      expect(CACHE_TTL.LONG).toBe(30 * 60 * 1000);
      expect(CACHE_TTL.VERY_LONG).toBe(60 * 60 * 1000);
      expect(CACHE_TTL.DAY).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('CACHE_TAGS constants', () => {
    it('defines expected tags', () => {
      expect(CACHE_TAGS.QUESTIONS).toBe('questions');
      expect(CACHE_TAGS.USER).toBe('user');
      expect(CACHE_TAGS.CHAPTERS).toBe('chapters');
    });
  });
});
