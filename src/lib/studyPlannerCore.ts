/**
 * AI Study Planner - Core Algorithm
 * Local-first, instant calculations (<50ms)
 */

import type {
  TopicPriority,
  TimeAllocation,
  DailyPlan,
  DailyTask,
  RankPrediction,
  SWOTAnalysis,
  MotivationData,
  AdaptiveTarget
} from './studyPlannerTypes';

// ============================================
// TIME ALLOCATION - Exam Proximity Based
// ============================================

export function calculateTimeAllocation(daysToExam: number): TimeAllocation {
  // Dynamic allocation based on exam proximity
  if (daysToExam > 180) {
    // 6+ months: Focus on learning
    return { studyTime: 0.70, revisionTime: 0.20, mockTestTime: 0.10 };
  } else if (daysToExam > 90) {
    // 3-6 months: Balanced approach
    return { studyTime: 0.60, revisionTime: 0.25, mockTestTime: 0.15 };
  } else if (daysToExam > 30) {
    // 1-3 months: More revision
    return { studyTime: 0.45, revisionTime: 0.35, mockTestTime: 0.20 };
  } else if (daysToExam > 15) {
    // 2-4 weeks: Mock test focus
    return { studyTime: 0.30, revisionTime: 0.40, mockTestTime: 0.30 };
  } else {
    // Final days: Revision + Mocks only
    return { studyTime: 0.15, revisionTime: 0.45, mockTestTime: 0.40 };
  }
}

const normalizeDate = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
};

// ============================================
// TOPIC CATEGORIZATION - Accuracy Based
// ============================================

export function categorizeTopics(topicMasteryData: any[]): {
  weak: TopicPriority[];
  medium: TopicPriority[];
  strong: TopicPriority[];
} {
  const weak: TopicPriority[] = [];
  const medium: TopicPriority[] = [];
  const strong: TopicPriority[] = [];

  topicMasteryData.forEach((topic) => {
    const accuracy = topic.accuracy || 0;
    const questionsAttempted = topic.questions_attempted || 0;
    const normalizedLastPracticed = normalizeDate(topic.last_practiced);
    const daysSincePractice = normalizedLastPracticed
      ? Math.max(0, Math.floor((Date.now() - normalizedLastPracticed) / (1000 * 60 * 60 * 24)))
      : 30;

    // Priority Score: Higher = More urgent
    const priorityScore = calculatePriorityScore(accuracy, daysSincePractice, questionsAttempted);

    const topicPriority: TopicPriority = {
      subject: topic.subject,
      chapter: topic.chapter,
      topic: topic.topic,
      accuracy,
      questionsAttempted,
      daysSincePractice,
      status: accuracy < 60 ? 'weak' : accuracy < 80 ? 'medium' : 'strong',
      priorityScore,
      allocatedMinutes: 0,
    };

    if (accuracy < 60) {
      weak.push(topicPriority);
    } else if (accuracy < 80) {
      medium.push(topicPriority);
    } else {
      strong.push(topicPriority);
    }
  });

  // Sort by priority (highest first)
  weak.sort((a, b) => b.priorityScore - a.priorityScore);
  medium.sort((a, b) => b.priorityScore - a.priorityScore);
  strong.sort((a, b) => b.priorityScore - a.priorityScore);

  return { weak, medium, strong };
}

function calculatePriorityScore(
  accuracy: number,
  daysSincePractice: number,
  questionsAttempted: number
): number {
  // Components:
  // 1. Weakness weight (lower accuracy = higher priority)
  // 2. Forgetting weight (more days = higher priority)
  // 3. Practice weight (fewer attempts = higher priority)
  
  const weaknessWeight = (100 - accuracy) * 0.5;
  const forgettingWeight = Math.min(daysSincePractice, 30) * 0.3;
  const practiceWeight = Math.max(0, (20 - questionsAttempted)) * 0.2;

  return weaknessWeight + forgettingWeight + practiceWeight;
}

// ============================================
// TIME DISTRIBUTION - Accuracy Based
// ============================================

export function allocateStudyTime(
  dailyStudyHours: number,
  timeAllocation: TimeAllocation,
  categorizedTopics: { weak: TopicPriority[]; medium: TopicPriority[]; strong: TopicPriority[] }
): { weak: TopicPriority[]; medium: TopicPriority[]; strong: TopicPriority[] } {
  const boundedStudyHours = Math.max(1, Math.min(12, dailyStudyHours));
  const totalMinutes = boundedStudyHours * 60;
  const studyMinutes = totalMinutes * timeAllocation.studyTime;

  // Accuracy-based distribution: 60% weak, 30% medium, 10% strong
  const weakMinutes = studyMinutes * 0.60;
  const mediumMinutes = studyMinutes * 0.30;
  const strongMinutes = studyMinutes * 0.10;

  const distributeTime = (topics: TopicPriority[], totalMins: number): TopicPriority[] => {
    if (topics.length === 0) return [];
    const minsPerTopic = Math.round(totalMins / Math.min(topics.length, 5)); // Max 5 topics/day
    return topics.slice(0, 5).map(t => ({ ...t, allocatedMinutes: minsPerTopic }));
  };

  return {
    weak: distributeTime(categorizedTopics.weak, weakMinutes),
    medium: distributeTime(categorizedTopics.medium, mediumMinutes),
    strong: distributeTime(categorizedTopics.strong, strongMinutes),
  };
}

// ============================================
// WEEKLY PLAN GENERATION
// ============================================

export function generateWeeklyPlan(
  dailyStudyHours: number,
  categorizedTopics: { weak: TopicPriority[]; medium: TopicPriority[]; strong: TopicPriority[] },
  timeAllocation: TimeAllocation
): DailyPlan[] {
  const plans: DailyPlan[] = [];
  const today = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const safeWeakLength = Math.max(1, categorizedTopics.weak.length);
  const safeMediumLength = Math.max(1, categorizedTopics.medium.length);
  const safeStrongLength = Math.max(1, categorizedTopics.strong.length);

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayOfWeek = date.getDay();
    const dayName = dayNames[dayOfWeek];
    const isRestDay = dayOfWeek === 0; // Sunday = Rest

    const tasks: DailyTask[] = [];
    let totalMinutes = 0;

    if (isRestDay) {
      // Light revision only on Sunday
      const revisionTopics = categorizedTopics.strong.slice(0, 2);
      revisionTopics.forEach(topic => {
        tasks.push({
          topic: topic.topic,
          subject: topic.subject,
          chapter: topic.chapter,
          duration: 30,
          type: 'revision',
          timeSlot: 'afternoon',
          priority: 'low'
        });
        totalMinutes += 30;
      });
    } else if (dayOfWeek === 6) {
      // Saturday: Mock Test Day
      const weakTasks = categorizedTopics.weak.slice(0, 2);
      weakTasks.forEach(topic => {
        tasks.push({
          topic: topic.topic,
          subject: topic.subject,
          chapter: topic.chapter,
          duration: 45,
          type: 'study',
          timeSlot: 'morning',
          priority: 'high'
        });
        totalMinutes += 45;
      });

      tasks.push({
        topic: 'Full Subject Mock Test',
        subject: 'Mixed',
        chapter: 'All Chapters',
        duration: 90,
        type: 'mock_test',
        timeSlot: 'afternoon',
        priority: 'high'
      });
      totalMinutes += 90;
    } else {
      // Weekdays: Focused Study
      // Morning: Weak topics (high priority)
      const morningTopics = categorizedTopics.weak.slice(i % safeWeakLength, (i % safeWeakLength) + 2);
      morningTopics.forEach(topic => {
        const duration = Math.max(30, Math.min(60, topic.allocatedMinutes || 45));
        tasks.push({
          topic: topic.topic,
          subject: topic.subject,
          chapter: topic.chapter,
          duration,
          type: 'study',
          timeSlot: 'morning',
          priority: 'high'
        });
        totalMinutes += duration;
      });

      // Afternoon: Medium topics
      const afternoonTopics = categorizedTopics.medium.slice(i % safeMediumLength, (i % safeMediumLength) + 1);
      afternoonTopics.forEach(topic => {
        tasks.push({
          topic: topic.topic,
          subject: topic.subject,
          chapter: topic.chapter,
          duration: 40,
          type: 'study',
          timeSlot: 'afternoon',
          priority: 'medium'
        });
        totalMinutes += 40;
      });

      // Evening: Revision of strong topics
      const eveningTopics = categorizedTopics.strong.slice(i % safeStrongLength, (i % safeStrongLength) + 1);
      eveningTopics.forEach(topic => {
        tasks.push({
          topic: topic.topic,
          subject: topic.subject,
          chapter: topic.chapter,
          duration: 25,
          type: 'revision',
          timeSlot: 'evening',
          priority: 'low'
        });
        totalMinutes += 25;
      });
    }

    plans.push({
      date: date.toISOString().split('T')[0],
      dayName,
      isRestDay,
      totalMinutes,
      tasks
    });
  }

  return plans;
}

// ============================================
// RANK PREDICTION
// ============================================

// Candidate count by exam type
const EXAM_CANDIDATES: Record<string, number> = {
  'JEE': 1200000,
  'JEE Main': 1200000,
  'JEE Advanced': 200000,
  'NEET': 1800000,
  'Scholarship': 100000,
  'Foundation': 500000,
  'Foundation-6': 500000,
  'Foundation-7': 500000,
  'Foundation-8': 500000,
  'Foundation-9': 500000,
  'Foundation-10': 500000,
};

export function predictRank(
  avgAccuracy: number,
  questionsAttempted: number,
  targetExam: string
): RankPrediction {
  // Get candidate count for the exam type
  const baseCandidates = EXAM_CANDIDATES[targetExam] || EXAM_CANDIDATES['Foundation'];

  // Experience factor
  const experienceFactor = questionsAttempted < 100 ? 1.3 :
                           questionsAttempted < 500 ? 1.1 :
                           questionsAttempted < 1000 ? 1.0 : 0.9;

  // Current rank projection
  const currentRank = Math.round(
    baseCandidates * (1 - avgAccuracy / 100) * experienceFactor
  );

  // Target: 90% accuracy
  const targetRank = Math.round(baseCandidates * 0.10 * 0.9);

  // Improvement timeline
  const accuracyGap = Math.max(0, 90 - avgAccuracy);
  const improvementWeeks = Math.ceil(accuracyGap / 2); // 2% per week

  // Percentile calculation
  const percentile = ((baseCandidates - currentRank) / baseCandidates) * 100;
  const percentileRange = percentile >= 99 ? 'Top 1%' :
                          percentile >= 95 ? 'Top 5%' :
                          percentile >= 90 ? 'Top 10%' :
                          percentile >= 80 ? 'Top 20%' :
                          percentile >= 50 ? 'Top 50%' : 'Below 50%';

  return {
    currentRank,
    targetRank,
    improvementWeeks,
    weeklyAccuracyTarget: Math.min(100, avgAccuracy + 2),
    percentileRange
  };
}

// ============================================
// SWOT ANALYSIS
// ============================================

export function generateSWOTAnalysis(
  categorizedTopics: { weak: TopicPriority[]; medium: TopicPriority[]; strong: TopicPriority[] }
): SWOTAnalysis {
  const strengths = categorizedTopics.strong
    .filter(t => t.accuracy >= 80 && t.questionsAttempted >= 10)
    .slice(0, 4)
    .map(t => `${t.subject}: ${t.topic} (${Math.round(t.accuracy)}%)`);

  const weaknesses = categorizedTopics.weak
    .filter(t => t.accuracy < 60)
    .slice(0, 4)
    .map(t => `${t.subject}: ${t.topic} (${Math.round(t.accuracy)}%)`);

  const opportunities = categorizedTopics.medium
    .filter(t => t.accuracy >= 65 && t.accuracy < 80)
    .slice(0, 3)
    .map(t => `${t.topic} is close to mastery (${Math.round(t.accuracy)}%)`);

  const threats = categorizedTopics.strong
    .filter(t => t.daysSincePractice >= 7)
    .slice(0, 3)
    .map(t => `${t.topic} not revised in ${t.daysSincePractice} days`);

  return {
    strengths: strengths.length > 0 ? strengths : ['Keep practicing to identify strengths'],
    weaknesses: weaknesses.length > 0 ? weaknesses : ['No critical weaknesses found'],
    opportunities: opportunities.length > 0 ? opportunities : ['Focus on building foundation'],
    threats: threats.length > 0 ? threats : ['Maintain regular revision schedule']
  };
}

// ============================================
// MOTIVATIONAL MESSAGES
// ============================================

export function generateMotivation(
  streak: number,
  avgAccuracy: number,
  questionsToday: number
): MotivationData {
  // Celebration
  if (streak >= 30) {
    return { message: `Amazing ${streak}-day streak! You're unstoppable!`, emoji: '🔥', type: 'celebration' };
  }
  if (avgAccuracy >= 85 && questionsToday >= 20) {
    return { message: 'Outstanding performance today! Keep crushing it!', emoji: '🌟', type: 'celebration' };
  }
  if (streak >= 7) {
    return { message: `Great consistency with ${streak}-day streak!`, emoji: '⚡', type: 'celebration' };
  }

  // Encouragement
  if (avgAccuracy >= 70) {
    return { message: 'Good progress! Push for 85%+ accuracy.', emoji: '💪', type: 'encouragement' };
  }
  if (questionsToday >= 10) {
    return { message: 'Nice work today! Keep the momentum going.', emoji: '👍', type: 'encouragement' };
  }

  // Warning
  if (avgAccuracy < 50 && questionsToday > 10) {
    return { message: 'Focus needed. Review mistakes carefully.', emoji: '⚠️', type: 'warning' };
  }

  // Default
  return { message: 'Start strong! Every question counts.', emoji: '🚀', type: 'encouragement' };
}

// ============================================
// ADAPTIVE TARGETS
// ============================================

export function calculateAdaptiveTarget(
  currentTarget: number,
  avgAccuracy: number,
  recentCompletionRate: number // 0-1
): AdaptiveTarget {
  let suggestedTarget = currentTarget;
  let reason = 'Target is appropriate';
  let shouldAdjust = false;

  // Consistently exceeding with high accuracy
  if (recentCompletionRate >= 0.8 && avgAccuracy >= 80) {
    suggestedTarget = Math.min(75, Math.ceil(currentTarget * 1.2));
    reason = 'Performing great! Time to level up.';
    shouldAdjust = suggestedTarget !== currentTarget;
  }
  // Struggling to complete
  else if (recentCompletionRate < 0.5) {
    suggestedTarget = Math.max(10, Math.floor(currentTarget * 0.8));
    reason = 'Adjusting to build consistency first.';
    shouldAdjust = suggestedTarget !== currentTarget;
  }
  // Low accuracy but completing
  else if (avgAccuracy < 60 && recentCompletionRate >= 0.7) {
    suggestedTarget = Math.max(10, Math.floor(currentTarget * 0.9));
    reason = 'Focus on quality over quantity.';
    shouldAdjust = suggestedTarget !== currentTarget;
  }

  return {
    currentTarget,
    suggestedTarget,
    reason,
    shouldAdjust
  };
}
