import React from 'react';
import { useFeatureFlags } from '@/contexts/FeatureFlagContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Zap, BookOpen, Trophy, MessageSquare, Sparkles, Bell, Users, CreditCard, FileText, TestTube, DatabaseZap, BarChart3, ArrowRightLeft, History, Layers3 } from 'lucide-react';
import { logger } from '@/utils/logger';

const CATEGORY_COLORS: Record<string, string> = {
  engagement: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ai: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  content: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  growth: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  monetization: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  core: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  general: 'bg-muted text-muted-foreground',
};

const FLAG_ICONS: Record<string, React.ElementType> = {
  leaderboard: Trophy,
  badges: Sparkles,
  ai_doubt_solver: MessageSquare,
  study_planner: Zap,
  push_notifications: Bell,
  referral_system: Users,
  pyq_explorer: BookOpen,
  test_mode: TestTube,
  educator_content: FileText,
  pricing_plans: CreditCard,
  analytics: BarChart3,
  study_now: ArrowRightLeft,
  test_history: History,
  snapshot: Layers3,
};

export const FeatureFlagManager: React.FC = () => {
  const { flags, refetch } = useFeatureFlags();

  const handleToggle = async (flagKey: string, currentValue: boolean) => {
    try {
      // First, check if a row exists in the DB. Defaults from the static registry
      // don't have a corresponding row, so an UPDATE silently affects 0 rows.
      const { data: existing, error: selectError } = await supabase
        .from('feature_flags')
        .select('flag_key')
        .eq('flag_key', flagKey)
        .maybeSingle();

      if (selectError) throw selectError;

      const flagDef = flags[flagKey];
      const nextValue = !currentValue;

      if (!existing) {
        // Upsert a full row using registry defaults so RLS + NOT NULL columns are satisfied.
        const { data: inserted, error: insertError } = await supabase
          .from('feature_flags')
          .insert({
            flag_key: flagKey,
            label: flagDef?.label || flagKey,
            description: flagDef?.description ?? null,
            category: flagDef?.category || 'general',
            rollout_percentage: flagDef?.rollout_percentage ?? 100,
            is_enabled: nextValue,
          })
          .select('flag_key');

        if (insertError) throw insertError;
        if (!inserted || inserted.length === 0) {
          throw new Error('Insert blocked. You may not have admin permissions.');
        }
      } else {
        const { data: updated, error: updateError } = await supabase
          .from('feature_flags')
          .update({ is_enabled: nextValue })
          .eq('flag_key', flagKey)
          .select('flag_key');

        if (updateError) throw updateError;
        if (!updated || updated.length === 0) {
          throw new Error('Update blocked. You may not have admin permissions.');
        }
      }

      toast.success(`${flagDef?.label || flagKey} ${nextValue ? 'enabled' : 'disabled'}`);
      await refetch();
    } catch (err: any) {
      logger.error('Feature flag toggle failed:', err);
      toast.error(err?.message || 'Failed to update feature flag');
    }
  };

  const sortedFlags = Object.values(flags).sort((a, b) => {
    const catOrder = ['content', 'engagement', 'ai', 'growth', 'monetization', 'general'];
    return catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
  });

  const groupedFlags = sortedFlags.reduce<Record<string, typeof sortedFlags>>((acc, flag) => {
    const cat = flag.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(flag);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Control which features are visible to students. Changes apply instantly.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            {Object.values(flags).filter(f => f.is_enabled).length} / {Object.values(flags).length} active
          </Badge>
        </div>
      </div>

      {Object.keys(flags).length === 0 && (
        <Card className="border-2 border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="p-8 text-center">
            <DatabaseZap className="w-12 h-12 mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Feature Flags Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              The feature_flags table is empty. Add entries in the database to enable feature controls.
            </p>
          </CardContent>
        </Card>
      )}

      {Object.entries(groupedFlags).map(([category, categoryFlags]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Badge className={`text-[10px] uppercase ${CATEGORY_COLORS[category] || CATEGORY_COLORS.general}`}>
                {category}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {categoryFlags.map((flag) => {
              const Icon = FLAG_ICONS[flag.flag_key] || Zap;
              return (
                <div
                  key={flag.flag_key}
                  className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${flag.is_enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                      <Icon className={`w-4 h-4 ${flag.is_enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${flag.is_enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {flag.label}
                      </p>
                      {flag.description && (
                        <p className="text-xs text-muted-foreground">{flag.description}</p>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={flag.is_enabled}
                    onCheckedChange={() => handleToggle(flag.flag_key, flag.is_enabled)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default FeatureFlagManager;
