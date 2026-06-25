// Single source of truth for JEEnie AI Doubt Solver daily limits.
// If you change these numbers, also update FREE_AI_DAILY_LIMIT,
// PRO_AI_DAILY_LIMIT and PRO_PLUS_AI_DAILY_LIMIT in
// supabase/functions/jeenie/index.ts (kept in sync manually since
// edge functions don't import from src/).

export const AI_DOUBT_DAILY_LIMITS = {
  free: 3,
  pro: 30,
  pro_plus: 100,
} as const;

export type AiTier = keyof typeof AI_DOUBT_DAILY_LIMITS;

export function getAiDoubtLimit(tier: AiTier | string | null | undefined): number {
  const key = (tier || 'free') as AiTier;
  return AI_DOUBT_DAILY_LIMITS[key] ?? AI_DOUBT_DAILY_LIMITS.free;
}
