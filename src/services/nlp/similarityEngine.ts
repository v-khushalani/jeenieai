/**
 * Similarity Engine
 * Multiple similarity algorithms for robust matching
 */

export interface SimilarityResult {
  score: number;
  matchedKeywords: string[];
  algorithm: string;
}

/**
 * Jaccard Similarity - Good for set overlap
 */
export function jaccardSimilarity(set1: string[], set2: string[]): SimilarityResult {
  if (!set1.length || !set2.length) {
    return { score: 0, matchedKeywords: [], algorithm: 'jaccard' };
  }

  const s1 = new Set(set1);
  const s2 = new Set(set2);
  const intersection = [...s1].filter(x => s2.has(x));
  const union = new Set([...s1, ...s2]);

  return {
    score: (intersection.length / union.size) * 100,
    matchedKeywords: intersection,
    algorithm: 'jaccard'
  };
}

/**
 * Weighted Jaccard - Considers keyword weights
 */
export function weightedJaccardSimilarity(
  weights1: Map<string, number>,
  weights2: Map<string, number>
): SimilarityResult {
  const allKeys = new Set([...weights1.keys(), ...weights2.keys()]);
  let minSum = 0;
  let maxSum = 0;
  const matchedKeywords: string[] = [];

  for (const key of allKeys) {
    const w1 = weights1.get(key) || 0;
    const w2 = weights2.get(key) || 0;
    minSum += Math.min(w1, w2);
    maxSum += Math.max(w1, w2);
    if (w1 > 0 && w2 > 0) {
      matchedKeywords.push(key);
    }
  }

  return {
    score: maxSum === 0 ? 0 : (minSum / maxSum) * 100,
    matchedKeywords,
    algorithm: 'weighted_jaccard'
  };
}

/**
 * TF-IDF Cosine Similarity - Best for semantic matching
 */
export function tfidfCosineSimilarity(
  queryKeywords: string[],
  targetKeywords: string[],
  allDocuments: string[][] // All topic keyword sets for IDF calculation
): SimilarityResult {
  if (!queryKeywords.length || !targetKeywords.length) {
    return { score: 0, matchedKeywords: [], algorithm: 'tfidf_cosine' };
  }

  const totalDocs = Math.max(allDocuments.length, 1);
  
  // Calculate IDF for each keyword
  const idf = new Map<string, number>();
  const allKeywords = new Set([...queryKeywords, ...targetKeywords]);
  
  for (const keyword of allKeywords) {
    const docsWithKeyword = allDocuments.filter(doc => doc.includes(keyword)).length;
    idf.set(keyword, Math.log((totalDocs + 1) / (docsWithKeyword + 1)) + 1);
  }

  // Calculate TF for query
  const queryTF = new Map<string, number>();
  for (const kw of queryKeywords) {
    queryTF.set(kw, (queryTF.get(kw) || 0) + 1);
  }

  // Calculate TF for target
  const targetTF = new Map<string, number>();
  for (const kw of targetKeywords) {
    targetTF.set(kw, (targetTF.get(kw) || 0) + 1);
  }

  // Build TF-IDF vectors
  const queryVector: number[] = [];
  const targetVector: number[] = [];
  const matchedKeywords: string[] = [];

  for (const keyword of allKeywords) {
    const qTF = queryTF.get(keyword) || 0;
    const tTF = targetTF.get(keyword) || 0;
    const idfVal = idf.get(keyword) || 1;

    queryVector.push(qTF * idfVal);
    targetVector.push(tTF * idfVal);
    
    if (qTF > 0 && tTF > 0) {
      matchedKeywords.push(keyword);
    }
  }

  // Cosine similarity
  const dotProduct = queryVector.reduce((sum, v, i) => sum + v * targetVector[i], 0);
  const queryMag = Math.sqrt(queryVector.reduce((sum, v) => sum + v * v, 0));
  const targetMag = Math.sqrt(targetVector.reduce((sum, v) => sum + v * v, 0));

  const score = queryMag === 0 || targetMag === 0 
    ? 0 
    : (dotProduct / (queryMag * targetMag)) * 100;

  return {
    score,
    matchedKeywords,
    algorithm: 'tfidf_cosine'
  };
}

/**
 * Combined similarity using multiple algorithms
 * Weights: 50% TF-IDF, 30% Weighted Jaccard, 20% Domain Match Bonus
 */
export function combinedSimilarity(
  queryKeywords: string[],
  queryWeights: Map<string, number>,
  targetKeywords: string[],
  allDocuments: string[][],
  domainBonus: number = 0 // 0-20 based on domain keyword matches
): SimilarityResult {
  const tfidf = tfidfCosineSimilarity(queryKeywords, targetKeywords, allDocuments);
  
  // Build target weights (uniform for curriculum)
  const targetWeights = new Map<string, number>();
  targetKeywords.forEach(k => targetWeights.set(k, 1));
  
  const wJaccard = weightedJaccardSimilarity(queryWeights, targetWeights);

  const combinedScore = 
    (tfidf.score * 0.5) + 
    (wJaccard.score * 0.3) + 
    (domainBonus * 1); // Domain bonus adds up to 20

  const allMatched = new Set([...tfidf.matchedKeywords, ...wJaccard.matchedKeywords]);

  return {
    score: Math.min(combinedScore, 100),
    matchedKeywords: Array.from(allMatched),
    algorithm: 'combined'
  };
}

/**
 * Quick text similarity for duplicate detection (optimized for speed)
 */
export function quickTextSimilarity(text1: string, text2: string): number {
  const normalize = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  const t1 = normalize(text1);
  const t2 = normalize(text2);
  
  // Quick length check
  const lenRatio = Math.min(t1.length, t2.length) / Math.max(t1.length, t2.length);
  if (lenRatio < 0.5) return lenRatio * 50; // Too different in length
  
  // Word-based Jaccard
  const words1 = new Set(t1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(t2.split(' ').filter(w => w.length > 2));
  
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  
  return union === 0 ? 0 : (intersection / union) * 100;
}
