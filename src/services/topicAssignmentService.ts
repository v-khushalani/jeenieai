/**
 * Topic Assignment Service
 * Uses the new NLP module for scalable, error-free auto-assignment
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { matchQuestion, batchMatchQuestions, clearCurriculumCache, type MatchResult } from "./nlp";

export interface AssignmentResult {
  chapterId: string | null;
  topicId: string | null;
  confidence: number;
  method: 'auto' | 'suggested' | 'manual';
  keywords: string[];
  matchedChapter?: {
    id: string;
    name: string;
  };
  matchedTopic?: {
    id: string;
    name: string;
  };
}

/**
 * Auto-assign chapter and topic to a question using NLP
 */
export async function autoAssignTopic(
  questionText: string,
  subject: string,
  chapterHint?: string
): Promise<AssignmentResult> {
  try {
    const result = await matchQuestion(questionText, subject, chapterHint);
    
    return {
      chapterId: result.chapterId,
      topicId: result.topicId,
      confidence: result.confidence,
      method: result.method,
      keywords: result.extractedKeywords,
      matchedChapter: result.chapterId && result.chapterName ? {
        id: result.chapterId,
        name: result.chapterName
      } : undefined,
      matchedTopic: result.topicId && result.topicName ? {
        id: result.topicId,
        name: result.topicName
      } : undefined
    };
  } catch (error) {
    logger.error('Error in autoAssignTopic:', error);
    return {
      chapterId: null,
      topicId: null,
      confidence: 0,
      method: 'manual',
      keywords: []
    };
  }
}

/**
 * Bulk auto-assign topics to multiple questions (optimized for scalability)
 */
export async function bulkAutoAssign(questionIds: string[]): Promise<{
  processed: number;
  autoAssigned: number;
  suggested: number;
  failed: number;
  results: Map<string, MatchResult>;
}> {
  let processed = 0;
  let autoAssigned = 0;
  let suggested = 0;
  let failed = 0;

  try {
    // Fetch all questions in one query
    const { data: questions, error } = await supabase
      .from('extracted_questions_queue')
      .select('id, parsed_question')
      .in('id', questionIds);

    if (error) throw error;
    if (!questions?.length) {
      return { processed: 0, autoAssigned: 0, suggested: 0, failed: 0, results: new Map() };
    }

    // Prepare questions for batch processing
    const questionsToMatch = questions.map(q => {
      const parsed = q.parsed_question as Record<string, any>;
      return {
        id: q.id,
        text: parsed.question || '',
        subject: parsed.subject || '',
        chapterHint: parsed.chapter
      };
    });

    // Batch match using optimized NLP
    const matchResults = await batchMatchQuestions(questionsToMatch);

    // Update questions sequentially to track counters properly
    for (const q of questions) {
      const result = matchResults.get(q.id);
      if (!result) {
        failed++;
        continue;
      }

      const parsed = q.parsed_question as Record<string, any>;
      const updatedParsed = {
        ...parsed,
        auto_assigned_chapter_id: result.chapterId,
        auto_assigned_topic_id: result.topicId,
        auto_assigned_chapter_name: result.chapterName,
        auto_assigned_topic_name: result.topicName,
        confidence_score: result.confidence,
        assignment_method: result.method,
        matched_keywords: result.matchedKeywords,
        domain_hits: result.domainHits
      };

      const { error: updateError } = await supabase
        .from('extracted_questions_queue')
        .update({ parsed_question: updatedParsed })
        .eq('id', q.id);

      if (updateError) {
        logger.error(`Failed to update question ${q.id}:`, updateError);
        failed++;
      } else {
        processed++;
        if (result.method === 'auto') autoAssigned++;
        else if (result.method === 'suggested') suggested++;
      }
    }

    return { processed, autoAssigned, suggested, failed, results: matchResults };
  } catch (error) {
    logger.error('Error in bulkAutoAssign:', error);
    return { processed: 0, autoAssigned: 0, suggested: 0, failed: questionIds.length, results: new Map() };
  }
}

/**
 * Get statistics for auto-assignment performance
 */
export async function getAssignmentStats(): Promise<{
  total: number;
  autoAssigned: number;
  suggested: number;
  manual: number;
  avgConfidence: number;
}> {
  try {
    const { data, error } = await supabase
      .from('extracted_questions_queue')
      .select('parsed_question')
      .eq('status', 'pending');

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      autoAssigned: 0,
      suggested: 0,
      manual: 0,
      avgConfidence: 0
    };

    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const item of data || []) {
      const parsed = item.parsed_question as Record<string, any>;
      const method = parsed?.assignment_method;
      const confidence = parsed?.confidence_score;

      if (method === 'auto') stats.autoAssigned++;
      else if (method === 'suggested') stats.suggested++;
      else stats.manual++;

      if (typeof confidence === 'number' && confidence > 0) {
        totalConfidence += confidence;
        confidenceCount++;
      }
    }

    if (confidenceCount > 0) {
      stats.avgConfidence = Math.round(totalConfidence / confidenceCount * 100) / 100;
    }

    return stats;
  } catch (error) {
    logger.error('Error getting assignment stats:', error);
    return { total: 0, autoAssigned: 0, suggested: 0, manual: 0, avgConfidence: 0 };
  }
}

/**
 * Re-export cache clear for external use
 */
export { clearCurriculumCache };
