import { MASTERY_CONFIG } from '@/config/studySystem';

export interface TopicMastery {
  subject: string;
  chapter: string;
  topic: string;
  currentLevel: 1 | 2 | 3 | 4;
  accuracy: number;
  questionsAttempted: number;
  lastPracticed: Date | null;
  stuckDays: number;
}

export function calculateMasteryLevel(
  accuracy: number,
  questionsAttempted: number
): 1 | 2 | 3 | 4 {
  // Level 4: Mastered
  if (accuracy >= MASTERY_CONFIG.LEVEL_4.minAccuracy && 
      questionsAttempted >= MASTERY_CONFIG.LEVEL_4.questionsNeeded) {
    return 4;
  }
  
  // Level 3: Advanced
  if (accuracy >= MASTERY_CONFIG.LEVEL_3.minAccuracy && 
      questionsAttempted >= MASTERY_CONFIG.LEVEL_3.questionsNeeded) {
    return 3;
  }
  
  // Level 2: Intermediate
  if (accuracy >= MASTERY_CONFIG.LEVEL_2.minAccuracy && 
      questionsAttempted >= MASTERY_CONFIG.LEVEL_2.questionsNeeded) {
    return 2;
  }
  
  // Level 1: Foundation
  return 1;
}

export function shouldLevelUp(mastery: TopicMastery): boolean {
  const currentConfig = MASTERY_CONFIG[`LEVEL_${mastery.currentLevel}` as keyof typeof MASTERY_CONFIG];
  
  if (mastery.currentLevel === 4) return false; // Already at max
  
  const nextLevel = (mastery.currentLevel + 1) as 2 | 3 | 4;
  const nextConfig = MASTERY_CONFIG[`LEVEL_${nextLevel}`];
  
  return (
    mastery.accuracy >= nextConfig.minAccuracy &&
    mastery.questionsAttempted >= nextConfig.questionsNeeded
  );
}

export function getQuestionsNeededForNextLevel(mastery: TopicMastery): number {
  if (mastery.currentLevel === 4) return 0;
  
  const nextLevel = (mastery.currentLevel + 1) as 2 | 3 | 4;
  const nextConfig = MASTERY_CONFIG[`LEVEL_${nextLevel}`];
  
  return Math.max(0, nextConfig.questionsNeeded - mastery.questionsAttempted);
}

export function getAccuracyNeededForNextLevel(mastery: TopicMastery): number {
  if (mastery.currentLevel === 4) return 0;
  
  const nextLevel = (mastery.currentLevel + 1) as 2 | 3 | 4;
  const nextConfig = MASTERY_CONFIG[`LEVEL_${nextLevel}`];
  
  return Math.max(0, nextConfig.minAccuracy - mastery.accuracy);
}

export function isTopicStuck(mastery: TopicMastery): boolean {
  return (
    mastery.accuracy < MASTERY_CONFIG.WEAK_ACCURACY_THRESHOLD &&
    mastery.stuckDays >= MASTERY_CONFIG.STUCK_THRESHOLD_DAYS
  );
}

export function getRecommendedQuestionsPerDay(level: 1 | 2 | 3 | 4): number {
  return MASTERY_CONFIG[`LEVEL_${level}`].questionsPerDay;
}

export function calculateProgressPercentage(mastery: TopicMastery): number {
  const levelKey = `LEVEL_${mastery.currentLevel}` as keyof typeof MASTERY_CONFIG;
  const levelConfig = MASTERY_CONFIG[levelKey];
  
  // Type guard to ensure levelConfig is a level object, not a number
  if (typeof levelConfig === 'number') {
    return 0;
  }
  
  const accuracyProgress = (mastery.accuracy / levelConfig.minAccuracy) * 50;
  const questionsProgress = (mastery.questionsAttempted / levelConfig.questionsNeeded) * 50;
  
  return Math.min(100, accuracyProgress + questionsProgress);
}
