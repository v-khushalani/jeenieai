import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Crown,
  FileQuestion,
  BookOpen,
  Layers,
  Package,
  IndianRupee,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ArrowRight,
  Sparkles,
  Upload,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface OverviewStats {
  users: number;
  newUsers7d: number;
  premiumUsers: number;
  questionBank: number;
  attempts: number;
  chapters: number;
  topics: number;
  activeBatches: number;
  pendingExtraction: number;
  pendingEducatorApprovals: number;
  totalRevenue: number;
}

interface ActivityItem {
  id: string;
  label: string;
  timestamp: string;
  type: 'user' | 'educator' | 'extract';
}

const DashboardOverview: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OverviewStats>({
    users: 0,
    newUsers7d: 0,
    premiumUsers: 0,
    questionBank: 0,
    attempts: 0,
    chapters: 0,
    topics: 0,
    activeBatches: 0,
    pendingExtraction: 0,
    pendingEducatorApprovals: 0,
    totalRevenue: 0,
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const loadOverview = async () => {
      try {
        setLoading(true);

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [
          users,
          newUsers,
          premiumUsers,
          questions,
          attempts,
          chapters,
          topics,
          batches,
          pendingExtraction,
          pendingEducatorApprovals,
          revenueRows,
          recentUsers,
          recentEducatorPending,
          recentExtractionPending,
        ] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_premium', true),
          supabase.from('questions').select('id', { count: 'exact', head: true }),
          supabase.from('question_attempts').select('id', { count: 'exact', head: true }),
          supabase.from('chapters').select('id', { count: 'exact', head: true }),
          supabase.from('topics').select('id', { count: 'exact', head: true }),
          supabase.from('batches').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('extracted_questions_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('educator_content').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
          supabase.from('payments').select('amount').eq('status', 'paid'),
          supabase.from('profiles').select('id, full_name, created_at').order('created_at', { ascending: false }).limit(5),
          supabase
            .from('educator_content')
            .select('id, title, submitted_at')
            .eq('approval_status', 'pending')
            .order('submitted_at', { ascending: false })
            .limit(5),
          supabase
            .from('extracted_questions_queue')
            .select('id, source_file, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(5),
        ]);

        const revenue = (revenueRows.data || []).reduce((sum, row) => sum + (row.amount || 0), 0) / 100;

        setStats({
          users: users.count || 0,
          newUsers7d: newUsers.count || 0,
          premiumUsers: premiumUsers.count || 0,
          questionBank: questions.count || 0,
          attempts: attempts.count || 0,
          chapters: chapters.count || 0,
          topics: topics.count || 0,
          activeBatches: batches.count || 0,
          pendingExtraction: pendingExtraction.count || 0,
          pendingEducatorApprovals: pendingEducatorApprovals.count || 0,
          totalRevenue: revenue,
        });

        const mergedActivities: ActivityItem[] = [
          ...(recentUsers.data || []).map((item) => ({
            id: `user-${item.id}`,
            label: `${item.full_name || 'New user'} joined`,
            timestamp: item.created_at || new Date().toISOString(),
            type: 'user' as const,
          })),
          ...(recentEducatorPending.data || []).map((item) => ({
            id: `educator-${item.id}`,
            label: `Pending educator content: ${item.title}`,
            timestamp: item.submitted_at || new Date().toISOString(),
            type: 'educator' as const,
          })),
          ...(recentExtractionPending.data || []).map((item) => ({
            id: `extract-${item.id}`,
            label: `Pending extraction review from ${item.source_file}`,
            timestamp: item.created_at || new Date().toISOString(),
            type: 'extract' as const,
          })),
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setActivities(mergedActivities.slice(0, 10));
      } catch (error) {
        logger.error('Failed to load admin overview:', error);
      } finally {
        setLoading(false);
      }
    };

    loadOverview();
  }, []);

  const premiumRate = useMemo(() => {
    if (!stats.users) return 0;
    return Math.round((stats.premiumUsers / stats.users) * 100);
  }, [stats.premiumUsers, stats.users]);

  const actionCards = [
    {
      title: 'Review Extracted Questions',
      subtitle: `${stats.pendingExtraction} pending`,
      icon: FileQuestion,
      route: '/admin/review-queue',
      urgent: stats.pendingExtraction > 0,
    },
    {
      title: 'Review Educator Content',
      subtitle: `${stats.pendingEducatorApprovals} pending approval`,
      icon: Upload,
      route: '/admin/educator-content',
      urgent: stats.pendingEducatorApprovals > 0,
    },
    {
      title: 'Manage Content Structure',
      subtitle: `${stats.chapters} chapters, ${stats.topics} topics`,
      icon: BookOpen,
      route: '/admin/chapters',
      urgent: false,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-linear-to-br from-primary/5 via-card to-secondary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-xl">Admin Command Center</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Monitor platform growth, moderation queues, content health, and revenue in one place.
              </p>
            </div>
            <Badge className="bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="w-3.5 h-3.5 mr-1" /> Live Snapshot
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MiniKpi title="Users" value={stats.users} icon={Users} />
        <MiniKpi title="Premium" value={`${stats.premiumUsers} (${premiumRate}%)`} icon={Crown} />
        <MiniKpi title="Question Bank" value={stats.questionBank} icon={FileQuestion} />
        <MiniKpi title="Attempts" value={stats.attempts} icon={ShieldCheck} />
        <MiniKpi title="Revenue" value={`₹${stats.totalRevenue.toLocaleString()}`} icon={IndianRupee} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Urgent Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {actionCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.title}
                  type="button"
                  onClick={() => navigate(card.route)}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${card.urgent ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-border bg-card hover:border-primary/30'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{card.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{card.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Content and Setup Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <HealthRow label="Active Batches" value={stats.activeBatches.toString()} icon={Package} />
            <HealthRow label="Chapters" value={stats.chapters.toString()} icon={Layers} />
            <HealthRow label="Topics" value={stats.topics.toString()} icon={BookOpen} />
            <HealthRow label="New users this week" value={stats.newUsers7d.toString()} icon={Users} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Operations</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading activity...</p>
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity in the latest window.</p>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {activities.map((item) => (
                  <div key={item.id} className="rounded-lg border p-2.5 bg-card">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-foreground leading-relaxed">{item.label}</p>
                      {item.type === 'user' ? (
                        <Badge variant="outline" className="text-[10px]">signup</Badge>
                      ) : item.type === 'educator' ? (
                        <Badge className="text-[10px] bg-amber-50 text-amber-700 border border-amber-300">review</Badge>
                      ) : (
                        <Badge className="text-[10px] bg-blue-50 text-blue-700 border border-blue-300">extract</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(item.timestamp).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className={stats.pendingExtraction > 0 || stats.pendingEducatorApprovals > 0 ? 'border-amber-300' : 'border-emerald-300'}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Moderation status</p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.pendingExtraction + stats.pendingEducatorApprovals > 0
                  ? `${stats.pendingExtraction + stats.pendingEducatorApprovals} items waiting for review`
                  : 'All moderation queues are clear'}
              </p>
            </div>
            {stats.pendingExtraction + stats.pendingEducatorApprovals > 0 ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Operational cadence</p>
              <p className="text-xs text-muted-foreground mt-1">
                Keep exam config, batches, and imports updated weekly.
              </p>
            </div>
            <Clock3 className="w-5 h-5 text-primary" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const MiniKpi: React.FC<{ title: string; value: string | number; icon: React.ElementType }> = ({ title, value, icon: Icon }) => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-xs text-muted-foreground">{title}</p>
      </div>
      <p className="text-lg font-bold leading-none">{value}</p>
    </CardContent>
  </Card>
);

const HealthRow: React.FC<{ label: string; value: string; icon: React.ElementType }> = ({ label, value, icon: Icon }) => (
  <div className="flex items-center justify-between rounded-lg border p-2.5 bg-card">
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
    <span className="text-sm font-semibold text-foreground">{value}</span>
  </div>
);

export default DashboardOverview;
