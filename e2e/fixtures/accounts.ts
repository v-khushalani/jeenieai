/**
 * Seeded QA accounts (created by the `seed-test-users` edge function).
 * Password comes from E2E_PASSWORD so it is never hardcoded as a literal here.
 */
export type Role = 'free' | 'pro' | 'proplus' | 'educator' | 'admin' | 'super';

export const PASSWORD = process.env.E2E_PASSWORD ?? '';

export const ACCOUNTS: Record<Role, { email: string; label: string }> = {
  free: { email: 'user@jeenie.website', label: 'Free user' },
  pro: { email: 'pro@jeenie.website', label: 'Pro user' },
  proplus: { email: 'proplus@jeenie.website', label: 'Pro+ user' },
  educator: { email: 'educator@jeenie.website', label: 'Educator' },
  admin: { email: 'admin@jeenie.website', label: 'Admin' },
  super: { email: 'super@jeenie.website', label: 'Super admin' },
};

export const ALL_ROLES = Object.keys(ACCOUNTS) as Role[];

/** Routes every signed-in role should be able to open without a dead end. */
export const COMMON_ROUTES = [
  '/dashboard',
  '/study-now',
  '/practice',
  '/tests',
  '/test-history',
  '/analytics',
  '/badges',
  '/profile',
  '/settings',
  '/subscription-plans',
];

/** Routes each role is expected to reach (in addition to COMMON_ROUTES). */
export const ROLE_ROUTES: Record<Role, string[]> = {
  free: [],
  pro: ['/ai-planner'],
  proplus: ['/ai-planner', '/pro-plus-library', '/battle'],
  educator: ['/educator'],
  admin: ['/admin'],
  super: ['/admin'],
};

/** Routes each role must NOT be able to open (should redirect or show a gate). */
export const FORBIDDEN_ROUTES: Record<Role, string[]> = {
  free: ['/admin', '/educator'],
  pro: ['/admin', '/educator'],
  proplus: ['/admin', '/educator'],
  educator: ['/admin'],
  admin: ['/educator'],
  super: [],
};
