/**
 * API response types and interfaces
 * 
 * Single source of truth for all API-related types.
 * Field names match Supabase database columns exactly.
 */

export interface SubjectStats {
  [subjectId: string]: {
    attempted: number;
    correct: number;
    accuracy: number;
    timeSpent: number;
  };
}

export interface TopicStats {
  [topicId: string]: {
    masteryLevel: number;
    questionsAttempted: number;
    lastAttempted: string | null;
  };
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  is_premium: boolean;
  subscription_end_date: string | null;
  total_points: number;
  current_streak: number;
  longest_streak?: number;
  goal_exam?: string | null;
  target_exam?: string | null;
  grade?: number | null;
  city?: string | null;
  phone?: string | null;
  daily_goal?: number;
  daily_question_limit?: number;
  goal_locked?: boolean;
  created_at: string;
  updated_at: string;
}

/** Matches question_attempts table columns exactly */
export interface QuestionAttempt {
  id: string;
  user_id: string;
  question_id: string;
  selected_option: string | null;
  is_correct: boolean;
  time_spent: number;
  points_earned: number;
  attempted_at: string;
}

export interface StreakStatus {
  currentStreak: number;
  longestStreak: number;
  todayCompleted: number;
  lastActivityDate: string | null;
}

export interface PointsData {
  totalPoints: number;
  level: number;
  rank: string;
  pointsToNextLevel: number;
  recentActivity: Array<{
    action: string;
    points: number;
    timestamp: string;
  }>;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}
