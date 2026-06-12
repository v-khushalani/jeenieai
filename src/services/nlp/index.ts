/**
 * NLP Module - Main exports
 * Scalable and error-free topic auto-assignment system
 */

export { extractKeywords, extractCurriculumKeywords } from './keywordExtractor';
export type { KeywordResult } from './keywordExtractor';

export { 
  jaccardSimilarity, 
  weightedJaccardSimilarity, 
  tfidfCosineSimilarity,
  combinedSimilarity,
  quickTextSimilarity 
} from './similarityEngine';
export type { SimilarityResult } from './similarityEngine';

export { 
  loadCurriculum, 
  clearCurriculumCache, 
  matchQuestion, 
  batchMatchQuestions,
  validateChapterSubject,
  validateTopicChapter
} from './curriculumMatcher';
export type { CurriculumItem, MatchResult } from './curriculumMatcher';
