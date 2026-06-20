export interface FeatureFlagDefinition {
  flag_key: string;
  label: string;
  description: string | null;
  is_enabled: boolean;
  rollout_percentage: number;
  category: string;
}

export const FEATURE_FLAG_REGISTRY: FeatureFlagDefinition[] = [
  {
    flag_key: 'study_now',
    label: 'Study Now',
    description: 'Main study flow and quick practice entry points.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'core',
  },
  {
    flag_key: 'test_mode',
    label: 'Test Mode',
    description: 'Full tests, test attempts, and test-specific entry points.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'core',
  },
  {
    flag_key: 'study_planner',
    label: 'AI Study Planner',
    description: 'AI-generated planner experience and entry points.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'ai',
  },
  {
    flag_key: 'ai_doubt_solver',
    label: 'AI Doubt Solver',
    description: 'Floating AI assistant and doubt-solving surfaces.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'ai',
  },
  {
    flag_key: 'live_notifications',
    label: 'Live Notifications',
    description: 'Live notification banner and realtime nudges.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'engagement',
  },
  {
    flag_key: 'badges',
    label: 'Badges',
    description: 'Badge showcase and badge-related entry points.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'engagement',
  },
  {
    flag_key: 'leaderboard',
    label: 'Leaderboard',
    description: 'Public leaderboard and ranking surfaces.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'engagement',
  },
  {
    flag_key: 'snapshot',
    label: 'Snapshot',
    description: 'Yearbook-style recap and snapshot share surfaces.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'engagement',
  },
  {
    flag_key: 'analytics',
    label: 'Analytics',
    description: 'Analytics page and analytics entry points.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'growth',
  },
  {
    flag_key: 'pricing_plans',
    label: 'Pricing Plans',
    description: 'Pricing page and subscription plan visibility.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'monetization',
  },
  {
    flag_key: 'group_tests',
    label: 'Group Tests',
    description: 'Create, join, and view group test leaderboards.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'core',
  },
  {
    flag_key: 'test_history',
    label: 'Test History',
    description: 'Historical test dashboard and history views.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'core',
  },
  {
    flag_key: 'referral_system',
    label: 'Referral System',
    description: 'Referral card, referral sections, and share rewards.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'growth',
  },
  {
    flag_key: 'push_notifications',
    label: 'Push Notifications',
    description: 'Push opt-in and notification settings surfaces.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'engagement',
  },
  {
    flag_key: 'educator_content',
    label: 'Educator Content',
    description: 'Pro+ library, educator content, and simulation surfaces.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'content',
  },
  {
    flag_key: 'roast_meme',
    label: 'Roast Memes',
    description: 'Funny roast meme cards after wrong answers.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'engagement',
  },
  {
    flag_key: 'install_app_prompt',
    label: 'Install App Prompt',
    description: 'PWA install prompt and dedicated install page.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'growth',
  },
  {
    flag_key: 'share_card',
    label: 'Share Cards',
    description: 'Shareable achievement and result cards.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'growth',
  },
  {
    flag_key: 'battle_mode',
    label: 'Battle Mode',
    description: '1v1 timed Pro+ battles with auto-matchmaking and rewards.',
    is_enabled: true,
    rollout_percentage: 100,
    category: 'engagement',
  },
  {
    flag_key: 'study_notes',
    label: 'Study Notes',
    description: 'Short theory + concept maps shown before practice. Keep OFF until enough chapters have notes authored.',
    is_enabled: false,
    rollout_percentage: 100,
    category: 'content',
  },
];

const byKey = (key: string) => FEATURE_FLAG_REGISTRY.find((flag) => flag.flag_key === key);

export const createDefaultFeatureFlagMap = () => {
  return FEATURE_FLAG_REGISTRY.reduce<Record<string, FeatureFlagDefinition>>((acc, flag) => {
    acc[flag.flag_key] = { ...flag };
    return acc;
  }, {});
};

export const mergeFeatureFlagRows = (rows: FeatureFlagDefinition[]) => {
  const defaults = createDefaultFeatureFlagMap();
  rows.forEach((row) => {
    const base = byKey(row.flag_key);
    // Ignore DB rows for flags that are no longer in the registry (deleted features).
    if (!base) return;
    defaults[row.flag_key] = {
      ...base,
      ...row,
      rollout_percentage: row.rollout_percentage ?? base.rollout_percentage ?? 100,
      description: row.description ?? base.description ?? null,
      category: row.category ?? base.category ?? 'general',
    };
  });
  return defaults;
};