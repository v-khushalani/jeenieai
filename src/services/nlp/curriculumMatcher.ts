/**
 * Curriculum Matcher
 * Matches questions to chapters/topics with caching for scalability
 */

import { supabase } from "@/integrations/supabase/client";
import { extractKeywords, extractCurriculumKeywords, type KeywordResult } from "./keywordExtractor";
import { combinedSimilarity, type SimilarityResult } from "./similarityEngine";
import { logger } from "@/utils/logger";

export interface CurriculumItem {
  id: string;
  name: string;
  subject: string;
  keywords: string[];
  parentId?: string;
  parentName?: string;
}

export interface MatchResult {
  chapterId: string | null;
  chapterName: string | null;
  topicId: string | null;
  topicName: string | null;
  confidence: number;
  method: 'auto' | 'suggested' | 'manual';
  matchedKeywords: string[];
  extractedKeywords: string[];
  domainHits: string[];
}

// Cache for curriculum data (expires after 5 minutes)
let curriculumCache: {
  chapters: CurriculumItem[];
  topics: CurriculumItem[];
  allKeywordSets: string[][];
  timestamp: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load curriculum data with caching
 */
export async function loadCurriculum(forceRefresh = false): Promise<{
  chapters: CurriculumItem[];
  topics: CurriculumItem[];
  allKeywordSets: string[][];
}> {
  const now = Date.now();
  
  if (!forceRefresh && curriculumCache && (now - curriculumCache.timestamp) < CACHE_TTL) {
    return curriculumCache;
  }

  try {
    const [chaptersRes, topicsRes] = await Promise.all([
      supabase.from('chapters').select('id, chapter_name, subject'),
      supabase.from('topics').select('id, topic_name, chapter_id')
    ]);

    if (chaptersRes.error) throw chaptersRes.error;
    if (topicsRes.error) throw topicsRes.error;

    const chapters: CurriculumItem[] = (chaptersRes.data || []).map(c => ({
      id: c.id,
      name: c.chapter_name,
      subject: c.subject,
      keywords: extractCurriculumKeywords(c.chapter_name)
    }));

    const chapterMap = new Map(chapters.map(c => [c.id, c]));

    const topics: CurriculumItem[] = (topicsRes.data || []).map(t => {
      const parent = chapterMap.get(t.chapter_id);
      return {
        id: t.id,
        name: t.topic_name,
        subject: parent?.subject || '',
        keywords: [
          ...extractCurriculumKeywords(t.topic_name),
          ...(parent?.keywords || [])
        ],
        parentId: t.chapter_id,
        parentName: parent?.name
      };
    });

    // Build all keyword sets for IDF calculation
    const allKeywordSets = [
      ...chapters.map(c => c.keywords),
      ...topics.map(t => t.keywords)
    ];

    curriculumCache = { chapters, topics, allKeywordSets, timestamp: now };
    
    logger.info('Curriculum cache refreshed', { 
      chapters: chapters.length, 
      topics: topics.length 
    });

    return curriculumCache;
  } catch (error) {
    logger.error('Failed to load curriculum:', error);
    return { chapters: [], topics: [], allKeywordSets: [] };
  }
}

/**
 * Clear curriculum cache (call after adding new chapters/topics)
 */
export function clearCurriculumCache(): void {
  curriculumCache = null;
  logger.info('Curriculum cache cleared');
}

/**
 * Validate that a chapter belongs to the specified subject
 */
export function validateChapterSubject(
  chapterId: string,
  subject: string,
  chapters: CurriculumItem[]
): boolean {
  const chapter = chapters.find(c => c.id === chapterId);
  if (!chapter) return false;
  return chapter.subject.toLowerCase() === subject.toLowerCase();
}

/**
 * Validate that a topic belongs to the specified chapter
 */
export function validateTopicChapter(
  topicId: string,
  chapterId: string,
  topics: CurriculumItem[]
): boolean {
  const topic = topics.find(t => t.id === topicId);
  if (!topic) return false;
  return topic.parentId === chapterId;
}

/**
 * Match a question to the best chapter and topic
 * STRICT MODE: Only assigns from database curriculum, validates subject-chapter-topic hierarchy
 */
export async function matchQuestion(
  questionText: string,
  subject: string,
  chapterHint?: string
): Promise<MatchResult> {
  const emptyResult: MatchResult = {
    chapterId: null,
    chapterName: null,
    topicId: null,
    topicName: null,
    confidence: 0,
    method: 'manual',
    matchedKeywords: [],
    extractedKeywords: [],
    domainHits: []
  };

  if (!questionText || questionText.length < 10) {
    return emptyResult;
  }

  // Normalize subject name for matching
  const normalizedSubject = subject.trim().toLowerCase();
  const subjectMap: Record<string, string> = {
    'physics': 'Physics',
    'chemistry': 'Chemistry',
    'mathematics': 'Mathematics',
    'maths': 'Mathematics',
    'math': 'Mathematics',
    'biology': 'Biology',
    'bio': 'Biology'
  };
  const canonicalSubject = subjectMap[normalizedSubject] || subject;

  try {
    // Extract keywords from question
    const { keywords, weightedKeywords, domainHits } = extractKeywords(questionText, canonicalSubject);
    
    if (keywords.length === 0) {
      return { ...emptyResult, extractedKeywords: [], domainHits };
    }

    // Load curriculum from database
    const { chapters, topics, allKeywordSets } = await loadCurriculum();
    
    // STRICT FILTER: Only chapters that EXACTLY match the subject from database
    const subjectChapters = chapters.filter(c => 
      c.subject.toLowerCase() === canonicalSubject.toLowerCase()
    );
    
    // STRICT FILTER: Only topics whose parent chapter is in the filtered subject
    const validChapterIds = new Set(subjectChapters.map(c => c.id));
    const subjectTopics = topics.filter(t => 
      t.parentId && validChapterIds.has(t.parentId)
    );

    if (subjectChapters.length === 0) {
      logger.warn('No chapters found for subject in database:', canonicalSubject);
      return { ...emptyResult, extractedKeywords: keywords, domainHits };
    }

    // Calculate domain bonus based on domain hits
    const domainBonus = Math.min(domainHits.length * 4, 20);

    // Score all topics
    const topicScores: Array<{
      item: CurriculumItem;
      similarity: SimilarityResult;
      finalScore: number;
    }> = [];

    for (const topic of subjectTopics) {
      const similarity = combinedSimilarity(
        keywords,
        weightedKeywords,
        topic.keywords,
        allKeywordSets,
        domainBonus
      );

      let finalScore = similarity.score;

      // Boost if chapter hint matches
      if (chapterHint && topic.parentName) {
        const hintLower = chapterHint.toLowerCase();
        const parentLower = topic.parentName.toLowerCase();
        if (parentLower.includes(hintLower) || hintLower.includes(parentLower)) {
          finalScore *= 1.25; // 25% boost
        }
      }

      topicScores.push({ item: topic, similarity, finalScore });
    }

    // Also score chapters directly
    const chapterScores: Array<{
      item: CurriculumItem;
      similarity: SimilarityResult;
      finalScore: number;
    }> = [];

    for (const chapter of subjectChapters) {
      const similarity = combinedSimilarity(
        keywords,
        weightedKeywords,
        chapter.keywords,
        allKeywordSets,
        domainBonus
      );

      let finalScore = similarity.score;

      // Boost if chapter hint matches
      if (chapterHint) {
        const hintLower = chapterHint.toLowerCase();
        const nameLower = chapter.name.toLowerCase();
        if (nameLower.includes(hintLower) || hintLower.includes(nameLower)) {
          finalScore *= 1.3; // 30% boost for direct chapter match
        }
      }

      chapterScores.push({ item: chapter, similarity, finalScore });
    }

    // Find best topic match
    topicScores.sort((a, b) => b.finalScore - a.finalScore);
    const bestTopic = topicScores[0];

    // Find best chapter match
    chapterScores.sort((a, b) => b.finalScore - a.finalScore);
    const bestChapter = chapterScores[0];

    // STRICT VALIDATION: Only assign if we have valid database matches
    let result: MatchResult;
    
    if (bestTopic && bestTopic.finalScore >= 35) {
      // STRICT: Verify topic's parent chapter exists and matches subject
      const parentChapter = subjectChapters.find(c => c.id === bestTopic.item.parentId);
      
      if (!parentChapter) {
        // Topic doesn't have valid parent in this subject - fall back to chapter
        logger.warn('Topic parent chapter not found in subject, falling back to chapter match');
      } else {
        // Valid topic match with verified hierarchy
        result = {
          chapterId: parentChapter.id,
          chapterName: parentChapter.name,
          topicId: bestTopic.item.id,
          topicName: bestTopic.item.name,
          confidence: Math.round(bestTopic.finalScore * 100) / 100,
          method: bestTopic.finalScore >= 70 ? 'auto' : 'suggested',
          matchedKeywords: bestTopic.similarity.matchedKeywords,
          extractedKeywords: keywords,
          domainHits
        };
        return result;
      }
    }
    
    if (bestChapter && bestChapter.finalScore >= 30) {
      // STRICT: Chapter is already filtered by subject, just verify it exists
      result = {
        chapterId: bestChapter.item.id,
        chapterName: bestChapter.item.name,
        topicId: null,
        topicName: null,
        confidence: Math.round(bestChapter.finalScore * 100) / 100,
        method: bestChapter.finalScore >= 65 ? 'auto' : 'suggested',
        matchedKeywords: bestChapter.similarity.matchedKeywords,
        extractedKeywords: keywords,
        domainHits
      };
    } else {
      // No good match - require manual assignment
      result = {
        ...emptyResult,
        confidence: Math.max(bestTopic?.finalScore || 0, bestChapter?.finalScore || 0),
        extractedKeywords: keywords,
        domainHits
      };
    }

    return result;
  } catch (error) {
    logger.error('Error in matchQuestion:', error);
    return emptyResult;
  }
}

/**
 * Batch match multiple questions (optimized for bulk processing)
 */
export async function batchMatchQuestions(
  questions: Array<{
    id: string;
    text: string;
    subject: string;
    chapterHint?: string;
  }>
): Promise<Map<string, MatchResult>> {
  const results = new Map<string, MatchResult>();

  // Pre-load curriculum once
  await loadCurriculum();

  // Process in parallel batches of 10
  const batchSize = 10;
  for (let i = 0; i < questions.length; i += batchSize) {
    const batch = questions.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(q => matchQuestion(q.text, q.subject, q.chapterHint))
    );
    batch.forEach((q, idx) => results.set(q.id, batchResults[idx]));
  }

  return results;
}
