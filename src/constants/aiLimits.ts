// Single source of truth for JEEnie AI Doubt Solver limits.
// IF you change these numbers, ALSO update the matching constants in
// supabase/functions/jeenie/index.ts (kept in sync manually because
// edge functions can't import from src/).

export const AI_DOUBT_DAILY_LIMITS = {
  free: 5,
  pro: 20,
  pro_plus: 50,
} as const;

// Monthly soft cap — prevents abuse / runaway cost while keeping daily UX
// generous. When hit, user is asked to wait until reset or upgrade.
export const AI_DOUBT_MONTHLY_LIMITS = {
  free: 50,
  pro: 400,
  pro_plus: 1000,
} as const;

// Anti-spam: minimum seconds between consecutive prompts per user.
export const AI_DOUBT_MIN_INTERVAL_SECONDS = {
  free: 20,
  pro: 8,
  pro_plus: 4,
} as const;

// Max characters accepted in a single user prompt.
export const AI_DOUBT_MAX_INPUT_CHARS = 800;

export type AiTier = keyof typeof AI_DOUBT_DAILY_LIMITS;

export function getAiDoubtLimit(tier: AiTier | string | null | undefined): number {
  const key = (tier || 'free') as AiTier;
  return AI_DOUBT_DAILY_LIMITS[key] ?? AI_DOUBT_DAILY_LIMITS.free;
}

export function getAiDoubtMonthlyLimit(tier: AiTier | string | null | undefined): number {
  const key = (tier || 'free') as AiTier;
  return AI_DOUBT_MONTHLY_LIMITS[key] ?? AI_DOUBT_MONTHLY_LIMITS.free;
}
