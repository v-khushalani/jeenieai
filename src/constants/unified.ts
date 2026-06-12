/**
 * UNIFIED CONSTANTS & CONFIG
 * ===========================
 * Single source of truth for all configuration values
 * Replaces scattered constants across multiple files
 * 
 * Usage: import { CONSTANTS, ENUMS, Icons } from '@/constants/unified'
 */

// ==========================================
// ENUMS (Use these instead of string literals)
// ==========================================

export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD'
}

export enum QuestionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  TRUE_FALSE = 'true_false',
  FILL_BLANK = 'fill_blank',
  ESSAY = 'essay'
}

export enum AchievementType {
  FIRST_QUESTION = 'first_question',
  LEVEL_UP = 'level_up',
  STREAK_MILESTONE = 'streak_milestone',
  ACCURACY_MILESTONE = 'accuracy_milestone',
  QUESTION_MILESTONE = 'question_milestone'
}

export enum Program {
  FOUNDATION = 'Foundation',
  JEE = 'JEE',
  NEET = 'NEET',
  MH_CET = 'MH_CET'
}

export enum SubscriptionStatus {
  FREE = 'FREE',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED'
}

// ==========================================
// DIFFICULTY POINTS (Consolidated)
// ==========================================

export const DIFFICULTY_CONFIG = {
  [Difficulty.EASY]: {
    basePoints: 5,
    label: 'Easy',
    color: '#10B981',
    bgColor: 'bg-green-500',
    textColor: 'text-green-600'
  },
  [Difficulty.MEDIUM]: {
    basePoints: 10,
    label: 'Medium',
    color: '#F59E0B',
    bgColor: 'bg-yellow-500',
    textColor: 'text-yellow-600'
  },
  [Difficulty.HARD]: {
    basePoints: 20,
    label: 'Hard',
    color: '#EF4444',
    bgColor: 'bg-red-500',
    textColor: 'text-red-600'
  }
};

// ==========================================
// ACCURACY THRESHOLDS (Single Source of Truth)
// ==========================================

export const ACCURACY_THRESHOLDS = {
  WEAK: 0.60,        // Below 60%
  MODERATE: 0.75,    // 60-79%
  STRONG: 0.80,      // 80%+
  EXCELLENT: 0.95    // 95%+
};

// Map accuracy to level
export const getAccuracyLevel = (accuracy: number): 'WEAK' | 'MODERATE' | 'STRONG' | 'EXCELLENT' => {
  if (accuracy >= ACCURACY_THRESHOLDS.EXCELLENT) return 'EXCELLENT';
  if (accuracy >= ACCURACY_THRESHOLDS.STRONG) return 'STRONG';
  if (accuracy >= ACCURACY_THRESHOLDS.MODERATE) return 'MODERATE';
  return 'WEAK';
};

// ==========================================
// MASTERY & LEVEL CONFIGURATION (Unified)
// ==========================================

export const MASTERY_LEVELS = {
  LEVEL_1: {
    level: 1,
    name: 'Foundation Building',
    minAccuracy: 0,
    questionsNeeded: 15,
    questionsPerDay: 5,
    description: 'Foundation concepts',
    color: 'green',
    bgColor: 'bg-green-500',
    textColor: 'text-green-600'
  },
  LEVEL_2: {
    level: 2,
    name: 'Intermediate Practice',
    minAccuracy: 70,
    questionsNeeded: 25,
    questionsPerDay: 10,
    description: 'Applied knowledge',
    color: 'blue',
    bgColor: 'bg-blue-500',
    textColor: 'text-blue-600'
  },
  LEVEL_3: {
    level: 3,
    name: 'Advanced Mastery',
    minAccuracy: 85,
    questionsNeeded: 40,
    questionsPerDay: 15,
    description: 'Expert level',
    color: 'purple',
    bgColor: 'bg-purple-500',
    textColor: 'text-purple-600'
  },
  LEVEL_4: {
    level: 4,
    name: 'Maintenance Mode',
    minAccuracy: 90,
    questionsNeeded: 60,
    questionsPerDay: 3,
    description: 'Expert retention',
    color: 'indigo',
    bgColor: 'bg-indigo-500',
    textColor: 'text-indigo-600'
  }
};

// ==========================================
// STREAK & GAMIFICATION
// ==========================================

export const STREAK_CONFIG = {
  FREEZE_COST: 5,              // Points to freeze streak
  DAILY_BONUS: 1,              // Points per daily question streak
  MILESTONE_10: { points: 25, badge: '🔥 Streak 10' },
  MILESTONE_25: { points: 50, badge: '⚡ Streak 25' },
  MILESTONE_50: { points: 100, badge: '💪 Streak 50' },
  MILESTONE_100: { points: 200, badge: '👑 Streak 100' }
};

// ==========================================
// SPACED REPETITION INTERVALS
// ==========================================

export const SPACED_REPETITION = {
  INTERVALS: [1, 3, 7, 15, 30, 60],  // days
  REVIEW_DURATION: [10, 8, 5, 5, 3, 3] // minutes
};

// ==========================================
// SUBSCRIPTION PLANS
// ==========================================

export const SUBSCRIPTION_CONFIG = {
  FREE: {
    dailyQuestionLimit: 15,
    monthlyTestLimit: 2,
    aiDoubtSolver: false,
    aiStudyPlanner: false,
    analyticsAdvanced: false,
    prioritySupport: false
  },
  PRO: {
    dailyQuestionLimit: Infinity,
    monthlyTestLimit: Infinity,
    aiDoubtSolver: true,
    aiStudyPlanner: true,
    analyticsAdvanced: true,
    prioritySupport: true
  }
};

// ==========================================
// PROGRAM CONFIGURATION
// ==========================================

export const PROGRAM_CONFIG = {
  [Program.FOUNDATION]: {
    name: Program.FOUNDATION,
    displayName: 'Foundation (6th-10th)',
    description: 'Complete PCMB syllabus practice for classes 6-10',
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
    grades: [6, 7, 8, 9, 10],
    icon: '📚',
    color: 'blue',
    isFreeAvailable: true
  },
  [Program.JEE]: {
    name: Program.JEE,
    displayName: 'JEE (11th-12th)',
    description: 'IIT-JEE Main + Advanced — Physics, Chemistry, Mathematics',
    subjects: ['Physics', 'Chemistry', 'Mathematics'],
    grades: [11, 12],
    icon: '🎯',
    color: 'purple',
    isFreeAvailable: true
  },
  [Program.NEET]: {
    name: Program.NEET,
    displayName: 'NEET (11th-12th)',
    description: 'Medical entrance — Physics, Chemistry, Biology',
    subjects: ['Physics', 'Chemistry', 'Biology'],
    grades: [11, 12],
    icon: '🩺',
    color: 'green',
    isFreeAvailable: true
  }
};

// ==========================================
// SUBJECTS BY PROGRAM
// ==========================================

export const SUBJECTS_BY_PROGRAM = {
  [Program.FOUNDATION]: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
  [Program.JEE]: ['Physics', 'Chemistry', 'Mathematics'],
  [Program.NEET]: ['Physics', 'Chemistry', 'Biology']
};

// ==========================================
// GREEK LETTERS & MATH SYMBOLS (Unified)
// ==========================================

export const GREEK_LETTERS = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  Delta: 'Δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  Theta: 'Θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  Lambda: 'Λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  Pi: 'Π',
  rho: 'ρ',
  sigma: 'σ',
  Sigma: 'Σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  Phi: 'Φ',
  chi: 'χ',
  psi: 'ψ',
  Psi: 'Ψ',
  omega: 'ω',
  Omega: 'Ω'
};

export const MATH_SYMBOLS = {
  infinity: '∞',
  integral: '∫',
  summation: '∑',
  product: '∏',
  approx: '≈',
  notEqual: '≠',
  lessThanEqual: '≤',
  greaterThanEqual: '≥',
  therefore: '∴',
  forAll: '∀',
  exists: '∃',
  element: '∈',
  notElement: '∉',
  subset: '⊂',
  superset: '⊃'
};

// Function to replace text representations with symbols
export const replaceGreekLetters = (text: string): string => {
  let result = text;
  Object.entries(GREEK_LETTERS).forEach(([key, symbol]) => {
    const patterns = [
      new RegExp(`\\\\${key}(?![a-z])`, 'gi'),  // \alpha
      new RegExp(`(?<![a-z])${key}(?![a-z])`, 'gi')  // alpha (but not in words)
    ];
    patterns.forEach(pattern => {
      result = result.replace(pattern, symbol);
    });
  });
  return result;
};

// ==========================================
// TIME RANGES & INTERVALS
// ==========================================

export const TIME_RANGES = {
  WEEK: 7,
  MONTH: 30,
  QUARTER: 90,
  YEAR: 365
};

export const DATE_FORMATS = {
  SHORT: 'MMM dd',
  MEDIUM: 'MMM dd, yyyy',
  LONG: 'MMMM dd, yyyy',
  TIME: 'HH:mm',
  DATETIME: 'MMM dd, yyyy HH:mm'
};

// ==========================================
// DASHBOARD CHART TYPES
// ==========================================

export const CHART_TYPES = {
  ACCURACY: 'accuracy',
  TOPICS: 'topics',
  LEVELS: 'levels',
  WEEKLY: 'weekly',
  COMPARISON: 'comparison'
};

// ==========================================
// PERFORMANCE COLORS
// ==========================================

export const PERFORMANCE_COLORS = {
  primary: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#8B5CF6',
  gray: '#6B7280'
};

// ==========================================
// STORAGE KEYS
// ==========================================

export const STORAGE_KEYS = {
  USER_PROGRESS: 'user_progress_data',
  USER_PREFERENCES: 'user_preferences',
  SESSION_DATA: 'current_session',
  LAST_ACTIVE: 'last_activity_timestamp',
  SELECTED_BATCH: 'selected_batch_id'
};

// ==========================================
// MOTIVATIONAL MESSAGES
// ==========================================

export const MOTIVATIONAL_MESSAGES = {
  HIGH_STREAK: [
    '🔥 Amazing! You\'re on fire with that study streak!',
    '⚡ Unstoppable! Keep that momentum going!',
    '🚀 You\'re crushing it! Stay consistent!'
  ],
  HIGH_ACCURACY: [
    '🎯 Excellent accuracy! You\'re mastering the concepts!',
    '💯 Perfect! Your understanding is rock solid!',
    '⭐ Outstanding performance! You\'re a star!'
  ],
  MILESTONE_REACHED: [
    '💪 Great dedication! You\'ve reached a major milestone!',
    '🏆 Achievement unlocked! You\'re making great progress!',
    '🎉 Congratulations! Another goal achieved!'
  ],
  ENCOURAGEMENT: [
    '📈 Good progress! Keep up the momentum!',
    '🚀 You\'re doing great! Every question counts!',
    '💫 Keep going! You\'re on the right track!'
  ],
  WELCOME: [
    'Welcome! Start your learning journey today!',
    'Ready to learn? Let\'s make today count!',
    'Your journey to knowledge begins now!'
  ]
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Get base points for a difficulty level
 */
export const getPointsForDifficulty = (difficulty: Difficulty | string): number => {
  const normalized = difficulty.toUpperCase() as Difficulty;
  return DIFFICULTY_CONFIG[normalized]?.basePoints || 5;
};

/**
 * Get the program type for a given grade and optional exam target
 * - Grades 6-10: Foundation (PCMB)
 * - Grades 11-12: JEE (PCM) or NEET (PCB) based on target_exam
 */
export const getProgramForGrade = (grade: number, targetExam?: string | null): Program => {
  if (grade <= 10) return Program.FOUNDATION;
  if (targetExam?.toUpperCase() === 'NEET') return Program.NEET;
  return Program.JEE; // Default for 11-12 without explicit NEET
};

/**
 * Get subjects available for a grade + exam combination
 * - 6-10: Physics, Chemistry, Mathematics, Biology
 * - 11-12 JEE: Physics, Chemistry, Mathematics
 * - 11-12 NEET: Physics, Chemistry, Biology
 */
export const getSubjectsForGrade = (grade: number, targetExam?: string | null): string[] => {
  const program = getProgramForGrade(grade, targetExam);
  return SUBJECTS_BY_PROGRAM[program];
};

/**
 * Get exam type string for batches (used in batch creation/lookup)
 * Returns: 'Foundation', 'JEE', or 'NEET'
 */
export const getExamTypeForGrade = (grade: number, targetExam?: string | null): string => {
  if (grade <= 10) return 'Foundation';
  if (targetExam?.toUpperCase() === 'NEET') return 'NEET';
  return 'JEE';
};

/**
 * Get exam field value for questions (used in question creation AND querying)
 * Matches the exam column value in the questions table.
 * Foundation uses plain 'Foundation' — grade isolation is via batch_id.
 */
export const getQuestionExamField = (grade: number, targetExam?: string | null): string => {
  if (grade <= 10) return 'Foundation';
  if (targetExam?.toUpperCase() === 'NEET') return 'NEET';
  return 'JEE';
};

/**
 * Get mastery level config
 */
export const getMasteryLevelConfig = (level: 1 | 2 | 3 | 4) => {
  const key = `LEVEL_${level}` as keyof typeof MASTERY_LEVELS;
  return MASTERY_LEVELS[key];
};

/**
 * Check if user qualifies for next level
 */
export const canLevelUp = (
  currentLevel: 1 | 2 | 3 | 4,
  questionsAnswered: number,
  accuracy: number
): boolean => {
  if (currentLevel >= 4) return false;
  
  const nextLevelConfig = getMasteryLevelConfig((currentLevel + 1) as any);
  return (
    questionsAnswered >= nextLevelConfig.questionsNeeded &&
    accuracy >= nextLevelConfig.minAccuracy
  );
};

export default {
  Difficulty,
  QuestionType,
  AchievementType,
  Program,
  SubscriptionStatus,
  DIFFICULTY_CONFIG,
  ACCURACY_THRESHOLDS,
  MASTERY_LEVELS,
  STREAK_CONFIG,
  SPACED_REPETITION,
  SUBSCRIPTION_CONFIG,
  PROGRAM_CONFIG,
  SUBJECTS_BY_PROGRAM,
  GREEK_LETTERS,
  MATH_SYMBOLS,
  TIME_RANGES,
  DATE_FORMATS,
  CHART_TYPES,
  PERFORMANCE_COLORS,
  STORAGE_KEYS,
  MOTIVATIONAL_MESSAGES
};
