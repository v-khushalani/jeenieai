/**
 * AI Study Planner - Type Definitions
 */

export interface TopicPriority {
  subject: string;
  chapter: string;
  topic: string;
  accuracy: number;
  questionsAttempted: number;
  daysSincePractice: number;
  status: 'weak' | 'medium' | 'strong';
  priorityScore: number;
  allocatedMinutes: number;
}

export interface TimeAllocation {
  studyTime: number;      // % for new topics (weak + medium)
  revisionTime: number;   // % for strong topics
  mockTestTime: number;   // % for mock tests
}

export interface DailyTask {
  topic: string;
  subject: string;
  chapter: string;
  duration: number;       // minutes
  type: 'study' | 'revision' | 'mock_test' | 'rest';
  timeSlot: 'morning' | 'afternoon' | 'evening';
  priority: 'high' | 'medium' | 'low';
}

export interface DailyPlan {
  date: string;
  dayName: string;
  isRestDay: boolean;
  totalMinutes: number;
  tasks: DailyTask[];
}

export interface RankPrediction {
  currentRank: number;
  targetRank: number;
  improvementWeeks: number;
  weeklyAccuracyTarget: number;
  percentileRange: string;
}

export interface SWOTAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface MotivationData {
  message: string;
  emoji: string;
  type: 'celebration' | 'encouragement' | 'warning';
}

export interface AdaptiveTarget {
  currentTarget: number;
  suggestedTarget: number;
  reason: string;
  shouldAdjust: boolean;
}

export interface AIInsights {
  personalizedGreeting: string;
  strengthAnalysis: string;
  weaknessStrategy: string;
  keyRecommendations: string[];
  motivationalMessage: string;
}

export type TargetExamType = 'JEE' | 'NEET' | 'MH_CET' | 'Scholarship' | 'Foundation' | 
  'Foundation-6' | 'Foundation-7' | 'Foundation-8' | 'Foundation-9' | 'Foundation-10';

export interface StudyPlannerData {
  // User settings
  dailyStudyHours: number;
  targetExam: TargetExamType;
  examDate: string;
  daysToExam: number;
  
  // Performance data
  avgAccuracy: number;
  totalQuestions: number;
  streak: number;
  
  // Topic categorization
  weakTopics: TopicPriority[];
  mediumTopics: TopicPriority[];
  strongTopics: TopicPriority[];
  
  // Generated plan
  timeAllocation: TimeAllocation;
  weeklyPlan: DailyPlan[];
  
  // Analysis
  rankPrediction: RankPrediction;
  swotAnalysis: SWOTAnalysis;
  motivation: MotivationData;
  adaptiveTarget: AdaptiveTarget;
  
  // AI Enhancement (optional)
  aiInsights: AIInsights | null;
  
  // State
  isLoading: boolean;
  hasEnoughData: boolean;
}
