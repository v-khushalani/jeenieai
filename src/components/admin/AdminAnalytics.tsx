import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Area, AreaChart, Legend,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import {
  Users, BookOpen, TrendingUp, Clock, Target, Activity,
  ArrowUpRight, ArrowDownRight, CalendarDays, Zap,
} from 'lucide-react';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import { JeenieCostPanel } from '@/components/admin/JeenieCostPanel';

type TimeRange = '7d' | '14d' | '30d';

interface PlatformStats {
  total_users: number;
  active_users_today: number;
  total_questions_attempted: number;
  total_assessments: number;
  avg_accuracy: number;
  total_study_time: number;
  prev_period_users: number;
  prev_period_attempts: number;
}

interface DayData {
  date: string;
  label: string;
  new_users: number;
  active_users: number;
  questions_attempted: number;
  accuracy: number;
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5, var(--primary)))',
];

const formatTime = (seconds: number) => {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  return hours >= 1000 ? `${(hours / 1000).toFixed(1)}k hrs` : `${hours}h`;
};

const calcTrend = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
};

export const AdminAnalytics: React.FC = () => {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [dailyData, setDailyData] = useState<DayData[]>([]);
  const [subjectData, setSubjectData] = useState<{ name: string; value: number }[]>([]);
  const [examData, setExamData] = useState<{ name: string; users: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>('7d');

  const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;

  const fetchStats = useCallback(async () => {
    try {
      const now = new Date();
      const periodStart = new Date(now.getTime() - days * 86400000);
      const prevStart = new Date(periodStart.getTime() - days * 86400000);
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const [usersRes, attemptsRes, testsRes, accuracyRes, studyRes, todayRes, prevUsersRes, prevAttemptsRes] =
        await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('question_attempts').select('id', { count: 'exact', head: true }),
          supabase.from('test_sessions').select('id', { count: 'exact', head: true }),
          supabase.from('question_attempts').select('is_correct'),
          supabase.from('profiles').select('total_study_time'),
          supabase.from('question_attempts').select('user_id').gte('attempted_at', todayStart.toISOString()),
          supabase.from('profiles').select('id', { count: 'exact', head: true })
            .gte('created_at', prevStart.toISOString()).lt('created_at', periodStart.toISOString()),
          supabase.from('question_attempts').select('id', { count: 'exact', head: true })
            .gte('attempted_at', prevStart.toISOString()).lt('attempted_at', periodStart.toISOString()),
        ]);

      const correct = accuracyRes.data?.filter(a => a.is_correct).length || 0;
      const total = accuracyRes.data?.length || 0;
      const studyTime = studyRes.data?.reduce((s, p) => s + (p.total_study_time || 0), 0) || 0;
      const activeToday = new Set(todayRes.data?.map(a => a.user_id) || []).size;

      setStats({
        total_users: usersRes.count || 0,
        active_users_today: activeToday,
        total_questions_attempted: attemptsRes.count || 0,
        total_assessments: testsRes.count || 0,
        avg_accuracy: total > 0 ? (correct / total) * 100 : 0,
        total_study_time: studyTime,
        prev_period_users: prevUsersRes.count || 0,
        prev_period_attempts: prevAttemptsRes.count || 0,
      });
    } catch (e) {
      logger.error('Stats fetch error:', e);
    }
  }, [days]);

  const fetchDaily = useCallback(async () => {
    try {
      const start = new Date(Date.now() - days * 86400000).toISOString();
      const [profilesRes, attemptsRes] = await Promise.all([
        supabase.from('profiles').select('created_at').gte('created_at', start),
        supabase.from('question_attempts').select('attempted_at, user_id, is_correct').gte('attempted_at', start),
      ]);

      const dateRange = Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000);
        return d.toISOString().split('T')[0];
      });

      const result: DayData[] = dateRange.map(date => {
        const newUsers = profilesRes.data?.filter(p => p.created_at?.startsWith(date)).length || 0;
        const dayAttempts = attemptsRes.data?.filter(a => a.attempted_at?.startsWith(date)) || [];
        const activeUsers = new Set(dayAttempts.map(a => a.user_id)).size;
        const correctDay = dayAttempts.filter(a => a.is_correct).length;
        const accuracy = dayAttempts.length > 0 ? (correctDay / dayAttempts.length) * 100 : 0;

        return {
          date,
          label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          new_users: newUsers,
          active_users: activeUsers,
          questions_attempted: dayAttempts.length,
          accuracy: Math.round(accuracy),
        };
      });

      setDailyData(result);
    } catch (e) {
      logger.error('Daily data fetch error:', e);
    }
  }, [days]);

  const fetchSubjects = async () => {
    try {
      const data = await fetchAllPaginated(() => supabase.from('questions').select('subject'));
      const counts: Record<string, number> = {};
      data?.forEach(q => {
        const s = q.subject || 'Other';
        counts[s] = (counts[s] || 0) + 1;
      });
      setSubjectData(Object.entries(counts).map(([name, value]) => ({ name, value })));
    } catch (e) {
      logger.error('Subject data error:', e);
    }
  };

  const fetchExamSplit = async () => {
    try {
      const { data } = await supabase.from('profiles').select('target_exam');
      const counts: Record<string, number> = {};
      data?.forEach(p => {
        const exam = p.target_exam || 'Not Set';
        counts[exam] = (counts[exam] || 0) + 1;
      });
      setExamData(Object.entries(counts).map(([name, users]) => ({ name, users })).sort((a, b) => b.users - a.users));
    } catch (e) {
      logger.error('Exam split error:', e);
    }
  };

  const fetchSubjectsCb = useCallback(async () => {
    await fetchSubjects();
  }, []);

  const fetchExamSplitCb = useCallback(async () => {
    await fetchExamSplit();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchStats(), fetchDaily(), fetchSubjectsCb(), fetchExamSplitCb()]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [range, fetchStats, fetchDaily, fetchSubjectsCb, fetchExamSplitCb]);

  const totalNewUsers = useMemo(() => dailyData.reduce((s, d) => s + d.new_users, 0), [dailyData]);
  const totalQuestions = useMemo(() => dailyData.reduce((s, d) => s + d.questions_attempted, 0), [dailyData]);
  const peakDay = useMemo(() => {
    if (!dailyData.length) return null;
    return dailyData.reduce((max, d) => d.active_users > max.active_users ? d : max, dailyData[0]);
  }, [dailyData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const userTrend = calcTrend(totalNewUsers, stats?.prev_period_users || 0);
  const attemptTrend = calcTrend(totalQuestions, stats?.prev_period_attempts || 0);

  return (
    <div className="space-y-6">
      {/* Header with time range */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Platform performance & engagement insights</p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {(['7d', '14d', '30d'] as TimeRange[]).map(r => (
            <Button
              key={r}
              variant={range === r ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setRange(r)}
            >
              {r === '7d' ? '7 Days' : r === '14d' ? '14 Days' : '30 Days'}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard icon={Users} label="Total Users" value={stats?.total_users || 0} />
        <KPICard icon={Activity} label="Active Today" value={stats?.active_users_today || 0} accent />
        <KPICard
          icon={BookOpen} label={`Questions (${range})`}
          value={totalQuestions} trend={attemptTrend}
        />
        <KPICard
          icon={TrendingUp} label={`New Users (${range})`}
          value={totalNewUsers} trend={userTrend}
        />
        <KPICard icon={Target} label="Avg Accuracy" value={`${Math.round(stats?.avg_accuracy || 0)}%`} />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Trend — spans 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">User Activity & Questions</CardTitle>
              {peakDay && (
                <Badge variant="secondary" className="text-[10px]">
                  Peak: {peakDay.label} ({peakDay.active_users} users)
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="gradActive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradQuestions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="active_users" name="Active Users"
                  stroke="hsl(var(--primary))" fill="url(#gradActive)" strokeWidth={2} />
                <Area type="monotone" dataKey="questions_attempted" name="Questions"
                  stroke="hsl(var(--chart-2))" fill="url(#gradQuestions)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Subject Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Question Bank by Subject</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={subjectData} cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                  paddingAngle={3} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {subjectData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {subjectData.map((s, i) => (
                <div key={s.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <div className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {s.name}: {s.value}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* New Registrations */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">New Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                />
                <Bar dataKey="new_users" name="New Users" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Accuracy Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Accuracy Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                  formatter={(value: number) => [`${value}%`, 'Accuracy']}
                />
                <Line type="monotone" dataKey="accuracy" name="Accuracy %"
                  stroke="hsl(var(--chart-3))" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Exam Split */}
      {examData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Users by Target Exam</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {examData.map((e, i) => (
                <div key={e.name} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.users} users</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

/* ── KPI Card ───────────────────────────────────────────── */

interface KPICardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  trend?: number;
  accent?: boolean;
}

const KPICard: React.FC<KPICardProps> = ({ icon: Icon, label, value, trend, accent }) => (
  <Card className={cn('transition-all', accent && 'border-primary/30')}>
    <CardContent className="p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn('p-1.5 rounded-md', accent ? 'bg-primary/15' : 'bg-muted')}>
          <Icon className={cn('h-3.5 w-3.5', accent ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <p className="text-[11px] font-medium text-muted-foreground truncate">{label}</p>
      </div>
      <p className="text-xl font-bold text-foreground">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {trend !== undefined && (
        <div className={cn(
          'flex items-center gap-0.5 text-[10px] font-medium mt-1',
          trend >= 0 ? 'text-primary' : 'text-destructive'
        )}>
          {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(trend)}% vs prev period
        </div>
      )}
    </CardContent>
  </Card>
);
