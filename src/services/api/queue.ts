/**
 * Request Queue Service
 * 
 * Provides:
 * - Rate limiting (configurable requests per minute/second)
 * - Request deduplication
 * - Priority queuing
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern
 * 
 * FREE solution - no external dependencies
 */

import { logger } from '@/utils/logger';

type QueuePriority = 'high' | 'normal' | 'low';

interface QueuedRequest<T> {
  id: string;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  priority: QueuePriority;
  retries: number;
  maxRetries: number;
  addedAt: number;
}

interface QueueConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerSecond: number;
  maxConcurrent: number;
  maxRetries: number;
  baseRetryDelay: number;
  requestTimeout: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetTime: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  maxRequestsPerMinute: 50,      // Conservative for Gemini free tier
  maxRequestsPerSecond: 5,
  maxConcurrent: 3,
  maxRetries: 3,
  baseRetryDelay: 1000,
  requestTimeout: 30000,
  circuitBreakerThreshold: 5,    // Open breaker after 5 consecutive failures
  circuitBreakerResetTime: 30000, // Reset after 30 seconds
};

class RequestQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private processing = false;
  private activeRequests = 0;
  private requestTimestamps: number[] = [];
  private pendingRequests = new Map<string, Promise<unknown>>();
  private config: QueueConfig;
  
  // Circuit breaker state
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitOpenedAt = 0;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Enqueue a request with automatic deduplication
   */
  async enqueue<T>(
    fn: () => Promise<T>,
    options: {
      id?: string;
      priority?: QueuePriority;
      maxRetries?: number;
      deduplicate?: boolean;
    } = {}
  ): Promise<T> {
    const {
      id = this.generateId(),
      priority = 'normal',
      maxRetries = this.config.maxRetries,
      deduplicate = true,
    } = options;

    // Check circuit breaker
    if (this.circuitOpen) {
      const timeSinceOpen = Date.now() - this.circuitOpenedAt;
      if (timeSinceOpen < this.config.circuitBreakerResetTime) {
        throw new Error('Service temporarily unavailable. Please try again later.');
      }
      // Reset circuit breaker
      this.circuitOpen = false;
      this.consecutiveFailures = 0;
    }

    // Deduplicate: Return existing promise if same request is in flight
    if (deduplicate && this.pendingRequests.has(id)) {
      return this.pendingRequests.get(id) as Promise<T>;
    }

    const promise = new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id,
        fn,
        resolve,
        reject,
        priority,
        retries: 0,
        maxRetries,
        addedAt: Date.now(),
      };

      // Insert based on priority
      if (priority === 'high') {
        this.queue.unshift(request as QueuedRequest<unknown>);
      } else if (priority === 'low') {
        this.queue.push(request as QueuedRequest<unknown>);
      } else {
        // Insert after high priority items
        const insertIndex = this.queue.findIndex(r => r.priority !== 'high');
        if (insertIndex === -1) {
          this.queue.push(request as QueuedRequest<unknown>);
        } else {
          this.queue.splice(insertIndex, 0, request as QueuedRequest<unknown>);
        }
      }

      this.processQueue();
    });

    if (deduplicate) {
      this.pendingRequests.set(id, promise);
      promise.finally(() => this.pendingRequests.delete(id));
    }

    return promise;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      requestsLastMinute: this.requestTimestamps.length,
      circuitOpen: this.circuitOpen,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /**
   * Clear the queue (reject all pending requests)
   */
  clear(): void {
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }

  // Private methods

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // Check rate limits
      await this.waitForRateLimit();

      // Check concurrent limit
      if (this.activeRequests >= this.config.maxConcurrent) {
        await this.sleep(100);
        continue;
      }

      const request = this.queue.shift();
      if (!request) continue;

      this.activeRequests++;
      this.recordRequest();

      this.executeRequest(request).finally(() => {
        this.activeRequests--;
      });
    }

    this.processing = false;
  }

  private async executeRequest(request: QueuedRequest<unknown>): Promise<void> {
    try {
      // Add timeout
      const result = await this.withTimeout(
        request.fn(),
        this.config.requestTimeout
      );
      
      // Success - reset circuit breaker
      this.consecutiveFailures = 0;
      request.resolve(result);
    } catch (error: unknown) {
      const err = error as Error & { status?: number };
      
      // Check if retriable
      if (this.isRetriableError(err) && request.retries < request.maxRetries) {
        request.retries++;
        const delay = this.calculateBackoff(request.retries);
        
        logger.warn(
          `[Queue] Retrying request ${request.id} in ${delay}ms ` +
          `(attempt ${request.retries}/${request.maxRetries})`
        );
        
        await this.sleep(delay);
        
        // Re-queue with high priority
        this.queue.unshift(request);
        this.processQueue();
        return;
      }

      // Update circuit breaker
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
        this.circuitOpen = true;
        this.circuitOpenedAt = Date.now();
        logger.error('[Queue] Circuit breaker opened due to consecutive failures');
      }

      request.reject(err);
    }
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Clean old timestamps
    const oneMinuteAgo = now - 60000;
    const oneSecondAgo = now - 1000;
    
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);
    
    // Check per-minute limit
    while (this.requestTimestamps.length >= this.config.maxRequestsPerMinute) {
      await this.sleep(1000);
      this.requestTimestamps = this.requestTimestamps.filter(t => t > Date.now() - 60000);
    }

    // Check per-second limit
    const requestsLastSecond = this.requestTimestamps.filter(t => t > oneSecondAgo).length;
    if (requestsLastSecond >= this.config.maxRequestsPerSecond) {
      await this.sleep(200);
    }
  }

  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  private isRetriableError(error: Error & { status?: number }): boolean {
    // Retry on rate limit (429), server errors (5xx), network errors
    if (error.status === 429) return true;
    if (error.status && error.status >= 500) return true;
    if (error.message?.includes('network')) return true;
    if (error.message?.includes('timeout')) return true;
    if (error.message?.includes('fetch failed')) return true;
    return false;
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.config.baseRetryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), ms);
    });
    return Promise.race([promise, timeoutPromise]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

// Singleton instances for different use cases
export const apiQueue = new RequestQueue({
  maxRequestsPerMinute: 100,
  maxRequestsPerSecond: 10,
  maxConcurrent: 5,
});

export const aiQueue = new RequestQueue({
  maxRequestsPerMinute: 50,    // More conservative for AI APIs
  maxRequestsPerSecond: 2,
  maxConcurrent: 2,
  maxRetries: 2,
  baseRetryDelay: 2000,
});

export { RequestQueue };
export type { QueueConfig, QueuePriority };
