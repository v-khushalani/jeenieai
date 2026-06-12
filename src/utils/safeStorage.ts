// src/utils/safeStorage.ts
// ✅ THIS PREVENTS APP CRASHES IN INCOGNITO MODE
import { logger } from "@/utils/logger";

/**
 * Safe wrapper around localStorage that handles errors gracefully
 * Use this instead of direct localStorage calls
 */
export const safeLocalStorage = {
  /**
   * Safely get item from localStorage
   * Returns null if not found or error occurs
   */
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      logger.warn(`⚠️ localStorage.getItem failed for key: ${key}`, error);
      return null;
    }
  },

  /**
   * Safely set item in localStorage
   * Returns true if successful, false if error
   */
  setItem: (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      logger.warn(`⚠️ localStorage.setItem failed for key: ${key}`, error);
      return false;
    }
  },

  /**
   * Safely remove item from localStorage
   * Returns true if successful, false if error
   */
  removeItem: (key: string): boolean => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      logger.warn(`⚠️ localStorage.removeItem failed for key: ${key}`, error);
      return false;
    }
  },

  /**
   * Safely clear all localStorage
   * Returns true if successful, false if error
   */
  clear: (): boolean => {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      logger.warn('⚠️ localStorage.clear failed', error);
      return false;
    }
  },

  /**
   * Get JSON object from localStorage
   * Returns fallback value if error or not found
   */
  getJSON: <T>(key: string, fallback: T): T => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return fallback;
      return JSON.parse(item);
    } catch (error) {
      logger.warn(`⚠️ Failed to parse JSON for key: ${key}`, error);
      return fallback;
    }
  },

  /**
   * Set JSON object in localStorage
   * Returns true if successful, false if error
   */
  setJSON: (key: string, value: any): boolean => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.warn(`⚠️ Failed to stringify JSON for key: ${key}`, error);
      return false;
    }
  },

  /**
   * Check if localStorage is available
   * Useful for detecting incognito mode
   */
  isAvailable: (): boolean => {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get item with expiry support
   * Item must be stored using setItemWithExpiry
   */
  getItemWithExpiry: (key: string): string | null => {
    try {
      const itemStr = localStorage.getItem(key);
      if (!itemStr) return null;

      const item = JSON.parse(itemStr);
      const now = new Date().getTime();

      // Check if expired
      if (item.expiry && now > item.expiry) {
        localStorage.removeItem(key);
        return null;
      }

      return item.value;
    } catch (error) {
      logger.warn(`⚠️ getItemWithExpiry failed for key: ${key}`, error);
      return null;
    }
  },

  /**
   * Set item with expiry time (in milliseconds)
   * Example: setItemWithExpiry('token', 'abc123', 3600000) // 1 hour
   */
  setItemWithExpiry: (key: string, value: string, ttl: number): boolean => {
    try {
      const now = new Date().getTime();
      const item = {
        value: value,
        expiry: now + ttl,
      };
      localStorage.setItem(key, JSON.stringify(item));
      return true;
    } catch (error) {
      logger.warn(`⚠️ setItemWithExpiry failed for key: ${key}`, error);
      return false;
    }
  },
};

// Export default for easier imports
export default safeLocalStorage;

/**
 * USAGE EXAMPLES:
 * 
 * // Instead of:
 * localStorage.getItem('user')
 * 
 * // Use:
 * import { safeLocalStorage } from '@/utils/safeStorage';
 * safeLocalStorage.getItem('user')
 * 
 * // For JSON:
 * const user = safeLocalStorage.getJSON('user', { name: 'Guest' });
 * 
 * // With expiry (1 hour):
 * safeLocalStorage.setItemWithExpiry('token', 'abc123', 3600000);
 */
