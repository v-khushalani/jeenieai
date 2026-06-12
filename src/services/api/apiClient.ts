/**
 * API Client
 * 
 * Centralized API client that wraps Supabase with:
 * - Automatic caching
 * - Request queuing
 * - Type safety
 * - Error normalization
 * - Pagination support
 * 
 * This is the foundation for all API calls in the application.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { cache, CACHE_TTL, CACHE_TAGS } from './cache';
import { apiQueue } from './queue';
import type { Database } from '@/integrations/supabase/types';

// Type aliases for database tables
export type Tables = Database['public']['Tables'];
export type TableName = keyof Tables;

// Generic response types
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  message: string;
  code: string;
  status?: number;
  details?: unknown;
}

// Query options
export interface QueryOptions {
  page?: number;
  pageSize?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
  select?: string;
  useCache?: boolean;
  cacheTTL?: number;
  cacheTags?: string[];
  priority?: 'high' | 'normal' | 'low';
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * Core API client class
 */
class ApiClient {
  /**
   * Fetch paginated data from a table
   */
  async fetchPaginated<T extends TableName>(
    table: T,
    options: QueryOptions = {}
  ): Promise<PaginatedResponse<Tables[T]['Row']>> {
    const {
      page = 1,
      pageSize = DEFAULT_PAGE_SIZE,
      orderBy = 'created_at',
      orderDirection = 'desc',
      filters = {},
      select = '*',
      useCache = true,
      cacheTTL = CACHE_TTL.MEDIUM,
      cacheTags = [],
      priority = 'normal',
    } = options;

    // Validate page size
    const validPageSize = Math.min(pageSize, MAX_PAGE_SIZE);
    const offset = (page - 1) * validPageSize;

    // Generate cache key
    const cacheKey = this.generateCacheKey(table, { 
      page, 
      pageSize: validPageSize, 
      orderBy, 
      orderDirection, 
      filters, 
      select 
    });

    // Check cache
    if (useCache) {
      const cached = cache.get<PaginatedResponse<Tables[T]['Row']>>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Queue the request
    return apiQueue.enqueue(
      async () => {
        // Build query - use any type for dynamic filters
        let query: any = supabase
          .from(table)
          .select(select, { count: 'exact' });

        // Apply filters using type-safe approach
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              query = query.in(key, value);
            } else {
              query = query.eq(key, value);
            }
          }
        });

        // Apply ordering and pagination
        query = query
          .order(orderBy, { ascending: orderDirection === 'asc' })
          .range(offset, offset + validPageSize - 1);

        const { data, error, count } = await query;

        if (error) {
          throw this.normalizeError(error);
        }

        const total = count || 0;
        const totalPages = Math.ceil(total / validPageSize);

        const response: PaginatedResponse<Tables[T]['Row']> = {
          data: (data || []) as unknown as Tables[T]['Row'][],
          pagination: {
            page,
            pageSize: validPageSize,
            total,
            totalPages,
            hasMore: page < totalPages,
          },
        };

        // Cache the response
        if (useCache) {
          cache.set(cacheKey, response, cacheTTL, [table, ...cacheTags]);
        }

        return response;
      },
      { id: cacheKey, priority, deduplicate: true }
    );
  }

  /**
   * Fetch a single item by ID
   */
  async fetchById<T extends TableName>(
    table: T,
    id: string,
    options: Omit<QueryOptions, 'page' | 'pageSize'> = {}
  ): Promise<ApiResponse<Tables[T]['Row']>> {
    const {
      select = '*',
      useCache = true,
      cacheTTL = CACHE_TTL.LONG,
      cacheTags = [],
    } = options;

    const cacheKey = `${table}:${id}:${select}`;

    // Check cache
    if (useCache) {
      const cached = cache.get<Tables[T]['Row']>(cacheKey);
      if (cached) {
        return { data: cached, error: null };
      }
    }

    try {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .eq('id' as any, id)
        .single();

      if (error) {
        return { data: null, error: this.normalizeError(error) };
      }

      // Cache the response
      if (useCache && data) {
        cache.set(cacheKey, data, cacheTTL, [table, ...cacheTags]);
      }

      return { data: data as unknown as Tables[T]['Row'], error: null };
    } catch (error) {
      return { data: null, error: this.normalizeError(error) };
    }
  }

  /**
   * Fetch multiple items by IDs (batched)
   */
  async fetchByIds<T extends TableName>(
    table: T,
    ids: string[],
    options: Omit<QueryOptions, 'page' | 'pageSize'> = {}
  ): Promise<ApiResponse<Tables[T]['Row'][]>> {
    const { select = '*', useCache = true, cacheTTL = CACHE_TTL.LONG } = options;

    if (ids.length === 0) {
      return { data: [], error: null };
    }

    // Check cache for individual items
    const cachedItems: Tables[T]['Row'][] = [];
    const uncachedIds: string[] = [];

    if (useCache) {
      ids.forEach(id => {
        const cached = cache.get<Tables[T]['Row']>(`${table}:${id}:${select}`);
        if (cached) {
          cachedItems.push(cached);
        } else {
          uncachedIds.push(id);
        }
      });

      // All items cached
      if (uncachedIds.length === 0) {
        return { data: cachedItems, error: null };
      }
    }

    try {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .in('id' as any, (useCache ? uncachedIds : ids) as any[]);

      if (error) {
        return { data: null, error: this.normalizeError(error) };
      }

      // Cache individual items
      if (useCache && data) {
        (data as unknown as Tables[T]['Row'][]).forEach((item: Tables[T]['Row']) => {
          cache.set(`${table}:${(item as { id: string }).id}:${select}`, item, cacheTTL, [table]);
        });
      }

      const allData = [...cachedItems, ...((data || []) as unknown as Tables[T]['Row'][])];
      return { data: allData, error: null };
    } catch (error) {
      return { data: null, error: this.normalizeError(error) };
    }
  }

  /**
   * Insert a new item
   */
  async insert<T extends TableName>(
    table: T,
    data: Tables[T]['Insert']
  ): Promise<ApiResponse<Tables[T]['Row']>> {
    try {
      const { data: inserted, error } = await supabase
        .from(table)
        .insert(data as never)
        .select()
        .single();

      if (error) {
        return { data: null, error: this.normalizeError(error) };
      }

      // Invalidate related cache
      cache.invalidateByTag(table);

      return { data: inserted as unknown as Tables[T]['Row'], error: null };
    } catch (error) {
      return { data: null, error: this.normalizeError(error) };
    }
  }

  /**
   * Update an item
   */
  async update<T extends TableName>(
    table: T,
    id: string,
    data: Tables[T]['Update']
  ): Promise<ApiResponse<Tables[T]['Row']>> {
    try {
      const { data: updated, error } = await supabase
        .from(table)
        .update(data as never)
        .eq('id' as any, id)
        .select()
        .single();

      if (error) {
        return { data: null, error: this.normalizeError(error) };
      }

      // Invalidate related cache
      cache.delete(`${table}:${id}:*`);
      cache.invalidateByTag(table);

      return { data: updated as unknown as Tables[T]['Row'], error: null };
    } catch (error) {
      return { data: null, error: this.normalizeError(error) };
    }
  }

  /**
   * Delete an item
   */
  async delete<T extends TableName>(
    table: T,
    id: string
  ): Promise<ApiResponse<null>> {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id' as any, id);

      if (error) {
        return { data: null, error: this.normalizeError(error) };
      }

      // Invalidate related cache
      cache.delete(`${table}:${id}:*`);
      cache.invalidateByTag(table);

      return { data: null, error: null };
    } catch (error) {
      return { data: null, error: this.normalizeError(error) };
    }
  }

  /**
   * Call a Supabase Edge Function
   */
  async callEdgeFunction<TRequest, TResponse>(
    functionName: string,
    payload: TRequest,
    options: {
      useQueue?: boolean;
      priority?: 'high' | 'normal' | 'low';
      useCache?: boolean;
      cacheTTL?: number;
      cacheKey?: string;
    } = {}
  ): Promise<ApiResponse<TResponse>> {
    const {
      useQueue = true,
      priority = 'normal',
      useCache = false,
      cacheTTL = CACHE_TTL.SHORT,
      cacheKey,
    } = options;

    // Check cache
    if (useCache && cacheKey) {
      const cached = cache.get<TResponse>(cacheKey);
      if (cached) {
        return { data: cached, error: null };
      }
    }

    const execute = async (): Promise<ApiResponse<TResponse>> => {
      try {
        const { data, error } = await supabase.functions.invoke<TResponse>(
          functionName,
          { body: payload }
        );

        if (error) {
          return { data: null, error: this.normalizeError(error) };
        }

        // Guard against silent failures where both data and error are null
        if (data === null || data === undefined) {
          return { 
            data: null, 
            error: { 
              message: `Edge function '${functionName}' returned no data`, 
              code: 'EMPTY_RESPONSE' 
            } 
          };
        }

        // Check for error responses wrapped inside data (edge functions may return error JSON with 200)
        const dataObj = data as Record<string, unknown>;
        if (dataObj && typeof dataObj === 'object' && 'error' in dataObj && !('success' in dataObj)) {
          return { 
            data: null, 
            error: { 
              message: String(dataObj.error || dataObj.message || 'Edge function error'), 
              code: String(dataObj.code || 'EDGE_FUNCTION_ERROR') 
            } 
          };
        }

        // Cache the response
        if (useCache && cacheKey && data) {
          cache.set(cacheKey, data, cacheTTL, [CACHE_TAGS.AI]);
        }

        return { data, error: null };
      } catch (error) {
        return { data: null, error: this.normalizeError(error) };
      }
    };

    if (useQueue) {
      return apiQueue.enqueue(execute, { priority });
    }

    return execute();
  }

  /**
   * Invalidate cache for a table or pattern
   */
  invalidateCache(tableOrPattern: string | RegExp): void {
    if (typeof tableOrPattern === 'string') {
      cache.invalidateByTag(tableOrPattern);
    } else {
      cache.invalidateByPattern(tableOrPattern);
    }
  }

  /**
   * Get the raw Supabase client for advanced queries
   */
  get rawClient() {
    return supabase;
  }

  // Private methods

  private generateCacheKey(
    table: string, 
    params: Record<string, unknown>
  ): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${JSON.stringify(params[key])}`)
      .join('&');
    return `${table}?${sortedParams}`;
  }

  private normalizeError(error: unknown): ApiError {
    // 🎭 STUDENTS SHOULD NEVER SEE TECHNICAL ERRORS
    // All errors get friendly Hinglish messages
    const FRIENDLY_MESSAGES = [
      'Arre yaar! Thoda sa hiccup aa gaya! 😅 Dobara try karo.',
      'Server pe chai break chal raha hai! ☕ Ek second ruko.',
      'Network thoda mood off mein hai! 🌐 Refresh karo ya thoda wait karo.',
      'Kuch toh gadbad hai! 🤔 But tension mat lo, dobara try karo.',
    ];
    const friendlyMsg = FRIENDLY_MESSAGES[Math.floor(Math.random() * FRIENDLY_MESSAGES.length)];

    // Log real error for admin debugging (console only)
    logger.error('API Error:', error);

    if (error instanceof Error) {
      return {
        message: friendlyMsg,
        code: 'ERROR',
        details: error,
      };
    }

    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      return {
        message: friendlyMsg,
        code: String(err.code || 'ERROR'),
        status: typeof err.status === 'number' ? err.status : undefined,
        details: err.details,
      };
    }

    return {
      message: friendlyMsg,
      code: 'UNKNOWN_ERROR',
    };
  }
}

// Singleton instance
export const apiClient = new ApiClient();

export { ApiClient };
