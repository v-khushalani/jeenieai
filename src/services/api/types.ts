/**
 * API Types
 * 
 * Centralized type definitions for all API responses and requests.
 */

// Re-export from apiClient
export type {
  PaginatedResponse,
  ApiResponse,
  ApiError,
  QueryOptions,
  TableName,
  Tables,
} from './apiClient';

// Domain-specific types

export interface Question {
  id: string;
  topic_id?: string | null;
  chapter_id?: string | null;
  subject_id?: string | null;
  batch_id?: string | null;
  subject: string;
  chapter?: string;
  question: string;
  question_text?: string | null;
  question_image_url?: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  correct_options?: string[] | null;
  question_type?: string | null;
  numerical_answer?: number | null;
  numerical_tolerance?: number | null;
  difficulty?: string | null;
  explanation?: string | null;
  source?: string | null;
  exam?: string;
  is_pyq?: boolean | null;
  pyq_exam?: string | null;
  pyq_year?: number | null;
  pyq_session?: string | null;
  is_active?: boolean;
  is_verified?: boolean;
  created_at?: string;
}

export interface Chapter {
  id: string;
  batch_id: string | null;
  subject: string;
  chapter_number: number;
  chapter_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Topic {
  id: string;
  chapter_id?: string | null;
  topic_number?: number | null;
  topic_name: string;
  description?: string | null;
  difficulty_level?: string | null;
  estimated_time?: number;
  estimated_hours?: number | null;
  is_active?: boolean;
  is_free?: boolean;
  order_index?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Batch {
  id: string;
  name: string;
  grade: number;
  exam_type: string;
  description: string | null;
  is_active: boolean;
  price: number | null;
  created_at: string;
}

export interface BatchWithSubjects extends Batch {
  subjects: string[];
}

export interface UserProfile {
  id: string;
  full_name?: string | null;
  email?: string;
  avatar_url?: string | null;
  is_premium?: boolean;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  subscription_end_date?: string | null;
  total_points?: number;
  current_streak?: number;
  longest_streak?: number;
  goal_exam?: string | null;
  target_exam?: string | null;
  target_rank?: number | null;
  grade?: number | null;
  city?: string | null;
  phone?: string | null;
  daily_goal?: number;
  daily_question_limit?: number;
  goal_locked?: boolean;
  questions_today?: number;
  created_at?: string;
  updated_at?: string;
}

export interface QuestionAttempt {
  id: string;
  user_id: string;
  question_id: string;
  is_correct: boolean;
  selected_option: string | null;
  time_spent: number;
  points_earned: number;
  attempted_at: string;
}

export interface TopicMastery {
  id: string;
  user_id: string;
  topic_id: string;
  mastery_level: number;
  questions_attempted: number;
  questions_correct: number;
  last_attempted: string | null;
  updated_at: string;
}

export interface TestSession {
  id: string;
  user_id: string;
  batch_id?: string | null;
  test_type?: string;
  title?: string;
  total_questions: number;
  attempted_questions: number;
  correct_answers: number;
  score?: number;
  accuracy?: number;
  time_taken?: number;
  time_limit?: number;
  started_at?: string;
  completed_at?: string | null;
  created_at?: string;
  status?: 'in_progress' | 'completed' | 'abandoned' | string;
  answers?: unknown;
  question_ids?: unknown;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  total_points: number;
  current_streak: number;
}

// AI-related types

export interface JeenieMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface JeenieRequest {
  contextPrompt: string;
  subject?: string;
  conversationHistory?: JeenieMessage[];
  image?: string;
}

export interface JeenieResponse {
  response: string;
  suggestions?: string[];
}

export interface StudyPlanRequest {
  userId: string;
  goalExam: string;
  targetRank: number;
  availableHoursPerDay: number;
  examDate: string;
  weakTopics?: string[];
}

export interface StudyPlanResponse {
  plan: {
    weeklySchedule: {
      day: string;
      subjects: string[];
      topics: string[];
      duration: number;
    }[];
    priorityTopics: string[];
    recommendations: string[];
  };
}

// Payment types

export interface PaymentOrder {
  orderId: string;
  amount: number;
  currency: string;
  receipt: string;
}

export interface PaymentVerification {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  planId: string;
}

// Utility types

export type SortDirection = 'asc' | 'desc';

export interface FilterOptions {
  subject?: string;
  chapter_id?: string;
  topic_id?: string;
  difficulty?: string;
  grade?: number;
  exam_type?: string;
}
