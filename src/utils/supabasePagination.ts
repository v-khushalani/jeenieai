/**
 * SUPABASE PAGINATION UTILITY
 * 
 * Supabase (PostgREST) silently caps results at 1000 rows by default.
 * This utility paginates through ALL rows to get accurate results.
 * 
 * Use this whenever you need to:
 * - Count questions per chapter/topic/subject (where total > 1000)
 * - Fetch all rows from a large table for client-side aggregation
 */

import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 1000;

/**
 * Fetch ALL rows from a Supabase query by paginating in batches.
 * 
 * @param buildQuery - Factory function that creates the base query (called per page).
 *                     Must NOT include .range() — that's added automatically.
 * @returns All rows combined from all pages.
 * 
 * Usage:
 * ```ts
 * const allQuestions = await fetchAllPaginated(() =>
 *   supabase
 *     .from('questions')
 *     .select('chapter_id, difficulty')
 *     .eq('subject', 'Physics')
 *     .eq('exam', 'JEE')
 * );
 * ```
 */
export async function fetchAllPaginated<T = any>(
  buildQuery: () => any
): Promise<T[]> {
  let allData: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData;
}


